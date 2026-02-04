#!/usr/bin/env python3
"""
Geocode businesses extracted from aerial map image.

Strategy:
1. Use pixel positions from the image mapped to lat/lng via known reference points
2. For each business, estimate lat/lng from its position in the image
3. Then use Google Geocoding API to find the nearest address at those coordinates (reverse geocode)
"""

import json
import time
import requests
import sys
import os
from pathlib import Path

# Google API (Geocoding only - Places API not enabled)
GOOGLE_API_KEY = "AIzaSyCeBL8MCVvOvsbti1YHQlT1UycFFTgdItM"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# Rate limiting
DELAY = 0.05  # 50ms between requests (40 req/sec)

DATA_DIR = Path(__file__).parent.parent / "data"
INPUT_FILE = DATA_DIR / "map_businesses.json"
OUTPUT_FILE = DATA_DIR / "map_businesses_geocoded.json"

# ============================================================================
# IMAGE GEO-REFERENCING
# ============================================================================
# The image is ~1430 x 810 pixels
# We use known street intersections as control points to map pixel -> lat/lng
#
# Control points (estimated from the image):
# 1. E Orangethorpe Ave & S Van Buren St (top center): pixel ~(680, 72)
#    Actual coords: 33.8480, -117.8945
# 2. La Palma Ave & Richfield Rd (bottom center-right): pixel ~(900, 615)
#    Actual coords: 33.8315, -117.8875
# 3. Railroad & N Tustin Ave (left): pixel ~(140, 460)
#    Actual coords: 33.8370, -117.9080
# 4. Miraloma Ave & N Lakeview Ave (right): pixel ~(1330, 445)
#    Actual coords: 33.8380, -117.8750

# Using a simple affine transformation with 2 primary control points
# Orangethorpe/VanBuren and LaPalma/Richfield for Y axis
# Left Railroad and Right Lakeview for X axis

# Image dimensions
IMG_W = 1430
IMG_H = 810

# Lat/Lng bounds derived from the control points
# Top of image (y=0): ~33.852
# Bottom of image (y=810): ~33.825
# Left of image (x=0): ~33.837 lat (approx), -117.915 lng
# Right of image (x=1430): -117.870 lng

LAT_TOP = 33.852     # top edge of image
LAT_BOTTOM = 33.825  # bottom edge of image
LNG_LEFT = -117.916  # left edge of image
LNG_RIGHT = -117.870 # right edge of image


def pixel_to_latlng(px, py):
    """Convert pixel coordinates to lat/lng using linear interpolation."""
    # Y axis: top=high lat, bottom=low lat
    lat = LAT_TOP - (py / IMG_H) * (LAT_TOP - LAT_BOTTOM)
    # X axis: left=west (more negative), right=east (less negative)
    lng = LNG_LEFT + (px / IMG_W) * (LNG_RIGHT - LNG_LEFT)
    return round(lat, 6), round(lng, 6)


def reverse_geocode(lat, lng):
    """Get street address from coordinates via Google Geocoding API."""
    params = {
        "latlng": f"{lat},{lng}",
        "key": GOOGLE_API_KEY,
        "result_type": "street_address|premise|subpremise",
    }
    try:
        resp = requests.get(GEOCODE_URL, params=params, timeout=10)
        data = resp.json()
        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            return {
                "address": result.get("formatted_address", ""),
                "place_id": result.get("place_id", ""),
            }
        # Try without result_type filter
        params.pop("result_type")
        resp = requests.get(GEOCODE_URL, params=params, timeout=10)
        data = resp.json()
        if data.get("status") == "OK" and data.get("results"):
            result = data["results"][0]
            return {
                "address": result.get("formatted_address", ""),
                "place_id": result.get("place_id", ""),
            }
    except Exception as e:
        print(f"  Reverse geocode error: {e}")
    return {"address": "", "place_id": ""}


# ============================================================================
# BUSINESS POSITIONS (pixel x, y from the image)
# Estimated by examining the image carefully
# ============================================================================

BUSINESS_PIXELS = {
    # === NORTH STRIP (near Orangethorpe Ave) ===
    "Subway": (900, 15),
    "Great Lengths": (1220, 10),
    "Jimboy's Tacos": (1160, 18),
    "Nailed It": (1280, 18),
    "76": (1060, 52),        # gas station near Orangethorpe/Richfield
    "Del Taco": (1020, 52),
    "U-Haul": (960, 110),
    "ATI": (980, 110),
    "USPS.COM": (690, 15),

    # === NW QUADRANT (W of Van Buren, N of Miraloma) ===
    "Medco": (290, 140),
    "GeneS": (370, 140),
    "Alliance Material Handling": (180, 175),
    "Bejac": (470, 170),
    "Ivans": (460, 210),
    "RWC": (560, 210),
    "LG": (600, 230),       # LG Hausys
    "Textiles": (420, 270),
    "Antidote Outdoors": (440, 250),
    "QXO": (470, 280),
    "Certified Build": (520, 240),
    "GIVEMETHEVIN.COM": (300, 220),
    "HandyBrew": (410, 310),
    "DXP": (330, 330),
    "Betts": (350, 350),
    "Fast Semi": (380, 350),
    "Dallas": (490, 350),
    "SCM": (500, 340),
    "FP Rentals": (560, 340),
    "Transko": (600, 350),
    "Ships Net Work": (560, 310),
    "Micon": (660, 310),
    "2RS": (660, 330),
    "Hardy": (670, 360),
    "Gift Shire": (740, 365),
    "Squad": (730, 275),
    "XCC": (810, 300),
    "Forum": (860, 260),
    "Techhouse": (880, 260),

    # === NE QUADRANT (E of Richfield, N of Miraloma) ===
    "FSC": (860, 320),
    "CRB": (970, 165),
    "Fortis": (980, 200),
    "DoMore": (1020, 220),
    "P&S Graphics & Displays": (1140, 200),
    "BD Loops": (1090, 195),
    "Managed Media": (1060, 180),
    "H1 Packaging": (1120, 180),
    "Phoenix": (1320, 180),
    "FP": (1180, 200),
    "Wildhouse": (1330, 225),
    "RD Builders": (1370, 260),
    "DCI Drywall": (1250, 290),
    "D&S": (1380, 300),
    "FEA": (1240, 345),
    "Conoco": (1270, 350),
    "Advanced Biomedical": (1180, 340),
    "US Polymers": (1200, 360),
    "Hartwell": (990, 345),
    "CAMA": (1000, 385),
    "Gannon": (1040, 395),
    "Power Tech": (1070, 400),
    "SSR": (1120, 395),
    "Libre Motors": (1160, 395),
    "Applied Biomedical": (1190, 395),
    "MaxiTroc": (1320, 375),
    "NLPT": (1330, 410),
    "TRT": (1280, 415),
    "76_2": (1310, 430),     # second 76 gas station
    "Public Storage": (1370, 430),
    "Teco Diagnostics": (1380, 450),

    # === W STRIP (W of Van Buren, near Railroad/Tustin) ===
    "Manheim": (50, 280),
    "Manco": (60, 340),
    "GMI": (130, 340),
    "MAG": (150, 350),
    "Pape Material Handling": (100, 405),
    "West Coast": (200, 420),
    "Amerisan": (340, 415),
    "One McDonough": (270, 425),
    "MW Industries": (400, 420),
    "Silac": (470, 430),
    "TMS Tinting": (580, 405),

    # === CENTRAL (around Miraloma Ave) ===
    "Onyx": (680, 400),
    "HAI": (720, 410),
    "Dulcey": (800, 400),
    "FBE": (630, 445),
    "OES": (680, 445),
    "Terrified": (700, 440),
    "Petra": (740, 480),
    "Door Systems": (830, 480),
    "2D Graphics": (900, 470),
    "Kensington": (720, 470),

    # === SOUTH-CENTRAL (between Miraloma and La Palma) ===
    "Eastern Coast Plumbers": (700, 510),
    "FedEx": (740, 510),
    "Nicholas": (640, 530),
    "SunGold": (700, 530),
    "CC": (750, 535),
    "PCI": (890, 530),
    "Anko": (800, 550),
    "DaVita": (910, 565),
    "SVT": (960, 555),
    "Sechrist": (990, 565),
    "Made In California": (650, 555),

    # === SW (W of Van Buren, S of Miraloma) ===
    "Economy": (110, 480),
    "Sunny D": (180, 480),
    "Lehr": (310, 465),
    "CableCon": (330, 490),
    "Raven": (460, 475),
    "AM Mfg": (370, 520),
    "AI Enterprises": (380, 535),
    "Precision": (420, 560),
    "Sunshine Products": (500, 585),
    "Nuve": (660, 590),

    # === EAST (Fee Ana St area, S of Miraloma) ===
    "Blair": (1100, 580),
    "BMO": (1220, 580),
    "Trader Industries": (1320, 460),
    "TBH": (1270, 470),
    "Direct Edge": (1300, 490),
    "E&E Accessories": (1250, 480),
    "Select Room": (1280, 500),
    "Freedom Workout": (1370, 500),
    "Orkin": (1330, 475),
    "F/A": (1240, 460),

    # === LA PALMA AVE CORRIDOR ===
    "Inszone": (810, 630),
    "Farmer Boys": (950, 640),
    "Master Buys": (1020, 640),
    "Zorn Pasta": (1100, 640),
    "DG": (870, 645),
    "Infosend": (1070, 660),
    "Cabinets": (1310, 640),
    "Sunstate": (1340, 645),
    "Live Wire Creative Services": (1280, 670),
    "Compare": (1020, 700),

    # === FAR SOUTH & SW ===
    "5 Star Packaging": (80, 550),
    "Chose Red": (60, 590),
    "Juice Whip Studio": (130, 620),
    "Concrete": (60, 720),
    "PCB": (160, 650),
    "Korea's Bulld": (200, 650),
    "RAS Right Angle Solutions": (320, 660),
    "NVS": (180, 670),
    "OneWay Manufacturing": (380, 700),
    "Solvay": (420, 700),
    "West International": (360, 720),
    "ADS": (340, 740),
    "Technic": (450, 750),
    "ARS": (460, 760),
    "Underfind": (620, 680),
    "Exclusive Wireless Resources": (530, 680),
    "RW Carbon": (600, 760),
    "CRST": (190, 740),
    "Econolite": (100, 490),
}


def main():
    # Load input
    print(f"Loading businesses from {INPUT_FILE}")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        input_data = json.load(f)

    businesses = input_data["businesses"]
    total = len(businesses)
    print(f"Found {total} businesses in input file")
    print(f"Have pixel positions for {len(BUSINESS_PIXELS)} businesses")

    # Load existing results if resuming
    results = []
    processed_names = set()
    if OUTPUT_FILE.exists():
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
                results = existing.get("businesses", [])
                processed_names = {b["original_name"] for b in results if b.get("lat")}
                print(f"Resuming: {len(processed_names)} already geocoded\n")
        except:
            pass

    found = 0
    not_found = 0

    for biz in businesses:
        name = biz["name"]
        near = biz.get("near_street", "")
        notes = biz.get("notes", "")

        # Check pixel map (handle "76_2" alias for second 76 station)
        pixel_key = name
        if name == "76" and "2nd location" in notes:
            pixel_key = "76_2"

        if pixel_key not in BUSINESS_PIXELS:
            print(f"  SKIP (no pixel data): {name}")
            not_found += 1
            results.append({
                "original_name": name,
                "lat": None,
                "lng": None,
                "address": "",
                "near_street": near,
                "notes": notes,
                "match_quality": "no_pixel_data",
            })
            continue

        if name in processed_names:
            found += 1
            continue

        px, py = BUSINESS_PIXELS[pixel_key]
        lat, lng = pixel_to_latlng(px, py)

        print(f"  {name}: pixel ({px},{py}) -> ({lat}, {lng})")

        # Reverse geocode to get address
        time.sleep(DELAY)
        geo = reverse_geocode(lat, lng)

        entry = {
            "original_name": name,
            "lat": lat,
            "lng": lng,
            "pixel_x": px,
            "pixel_y": py,
            "address": geo.get("address", ""),
            "place_id": geo.get("place_id", ""),
            "near_street": near,
            "notes": notes,
            "match_quality": "pixel_georef",
        }
        results.append(entry)
        found += 1

        addr_short = geo.get("address", "no address")[:60]
        print(f"    -> {addr_short}")

        # Save progress every 20
        if found % 20 == 0:
            save_results(results, found, not_found, total)

    # Final save
    save_results(results, found, not_found, total)

    print(f"\n{'='*60}")
    print(f"COMPLETE: {found} geocoded, {not_found} skipped out of {total}")
    print(f"Results saved to {OUTPUT_FILE}")


def save_results(results, found, not_found, total):
    """Save current results to output file."""
    output = {
        "source": "aerial_map_anaheim_industrial",
        "geocoded_date": time.strftime("%Y-%m-%d"),
        "method": "pixel_to_latlng_with_reverse_geocode",
        "stats": {
            "total": total,
            "geocoded": found,
            "skipped": not_found,
        },
        "image_bounds": {
            "lat_top": LAT_TOP,
            "lat_bottom": LAT_BOTTOM,
            "lng_left": LNG_LEFT,
            "lng_right": LNG_RIGHT,
        },
        "businesses": results
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()

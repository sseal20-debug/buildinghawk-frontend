#!/usr/bin/env python3
"""
Deed Monitor Scheduler
======================

Run the deed monitor on a schedule. Alternative to system cron.

Usage:
    # Run continuously (checks every hour)
    python scheduler.py
    
    # Run once daily at 6 AM
    python scheduler.py --time 06:00
    
    # Run every 30 minutes
    python scheduler.py --interval 30

For production, consider using:
- System cron (Linux/Mac)
- GitHub Actions (free, scheduled workflows)
- Railway.app cron jobs
- Render.com background workers
"""

import os
import sys
import time
import argparse
import logging
from datetime import datetime, timedelta

import schedule
from dotenv import load_dotenv

from deed_monitor import DeedMonitor, Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def run_monitor(days_back: int = 1):
    """Run the deed monitor for recent recordings."""
    
    logger.info("="*50)
    logger.info("Starting scheduled deed monitor run")
    logger.info("="*50)
    
    try:
        config = Config.from_env()
        monitor = DeedMonitor(config)
        
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')
        
        stats = monitor.run(start_date=start_date, end_date=end_date)
        
        logger.info(f"Run complete: {stats['records_matched']} matches, {stats['alerts_created']} alerts")
        
    except Exception as e:
        logger.error(f"Monitor run failed: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='Schedule deed monitor runs'
    )
    parser.add_argument(
        '--interval',
        type=int,
        default=60,
        help='Run interval in minutes (default: 60)'
    )
    parser.add_argument(
        '--time',
        help='Run at specific time daily (HH:MM format, e.g., 06:00)'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=1,
        help='Days of recordings to check each run (default: 1)'
    )
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run once and exit'
    )
    
    args = parser.parse_args()
    
    # Load environment variables
    load_dotenv()
    
    if args.once:
        run_monitor(args.days)
        return
    
    # Schedule jobs
    if args.time:
        schedule.every().day.at(args.time).do(run_monitor, days_back=args.days)
        logger.info(f"Scheduled to run daily at {args.time}")
    else:
        schedule.every(args.interval).minutes.do(run_monitor, days_back=args.days)
        logger.info(f"Scheduled to run every {args.interval} minutes")
    
    # Run immediately on start
    run_monitor(args.days)
    
    # Keep running
    logger.info("Scheduler running. Press Ctrl+C to stop.")
    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == '__main__':
    main()

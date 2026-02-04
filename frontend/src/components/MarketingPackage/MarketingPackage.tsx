import React from "react";

/**
 * CRE Marketing Package – Building Hawk
 * --------------------------------------------------
 * - PDF export via browser (Ctrl/Cmd+P)
 * - TailwindCSS classes
 */

// ---------- Types ----------
export type Contact = {
  name: string;
  title: string;
  license?: string;
  phone?: string;
  email?: string;
  headshotUrl?: string;
};

export type Property = {
  addressLine1: string; // "4940 La Palma Avenue"
  cityState: string; // "Anaheim, CA"
  heroImageUrl?: string;
};

export type AvailabilityRow = {
  building: string;
  property: string;
  size: string; // e.g. "20,705 SF | 5,914 SF Office"
  askingRate: string; // e.g. "$1.05 Gross"
  netCamExpense: string; // e.g. "$0.10 PSF"
  comments: string; // e.g. "Freestanding, yard ..."
  photoUrl?: string;
};

export type LeaseCompRow = {
  building: string;
  property: string;
  termMonths: string;
  size: string;
  type: string;
  askingRate: string;
  dealRate: string;
  increases: string;
  freeRent: string;
  startDateDom: string;
  tis: string;
  photoUrl?: string;
};

export type TransactionRow = {
  building: string;
  property: string;
  date: string;
  size: string;
  saleOrLease: string;
  party: string; // Lessor/Lessee/Buyer/Seller
  price?: string;
  photoUrl?: string;
};

export type Recommendations = {
  photoUrl?: string;
  addressHeading: string; // e.g. "4940 E. LA PALMA AVENUE, ANAHEIM, CA"
  askingLeaseRate: string;
  expectedFirstYearRate: string;
  term: string;
  increases: string;
  freeRent: string;
  tenantImprovements: string;
  timeOnMarket: string;
};

export type MarketingPackageData = {
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmSite: string;
  logoUrl?: string;
  subject: Property;
  preparedFor?: { name: string; company: string; address?: string };
  preparedBy: Contact[];
  presentedBy?: Contact[]; // map pages header
  availabilityRows: AvailabilityRow[];
  leaseCompRows: LeaseCompRow[];
  recentTransactions: TransactionRow[];
  recommendations: Recommendations;
};

// ---------- Utility ----------
const SectionTitle: React.FC<{ children: React.ReactNode }>=({ children })=> (
  <h2 className="text-xl font-semibold tracking-wide uppercase text-gray-800 print:text-black">{children}</h2>
);

const Card: React.FC<{ children: React.ReactNode; className?: string }>=({ children, className })=> (
  <div className={"bg-white rounded-2xl shadow-sm border border-gray-200 p-4 "+(className||"")}>{children}</div>
);

// ---------- Cover Page ----------
const CoverPage: React.FC<{data: MarketingPackageData}> = ({ data }) => {
  const { logoUrl, firmName, firmAddress, firmPhone, firmSite, subject, preparedFor, preparedBy } = data;
  return (
    <section className="min-h-[100vh] px-10 py-10 relative print:break-after-page">
      {/* Left color band - Building Hawk navy */}
      <div className="absolute left-0 top-0 h-full w-24 bg-navy print:bg-navy" />

      <div className="relative grid grid-cols-12 gap-8">
        {/* Hero image */}
        <div className="col-span-12 lg:col-span-8 lg:col-start-4">
          {subject.heroImageUrl ? (
            <img src={subject.heroImageUrl} alt="Subject" className="w-full h-72 object-cover rounded-xl shadow" />
          ) : (
            <div className="w-full h-72 rounded-xl bg-gray-100 grid place-items-center text-gray-500">Hero image</div>
          )}
        </div>

        {/* Title block */}
        <div className="col-span-12 lg:col-span-8 lg:col-start-4 space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Marketing Package</h1>
          <p className="text-lg text-gray-700">{subject.addressLine1}</p>
          <p className="text-gray-600">{subject.cityState}</p>
        </div>

        {/* Prepared for / Prepared by */}
        <div className="col-span-12 lg:col-span-8 lg:col-start-4 grid grid-cols-2 gap-6 mt-6">
          <Card>
            <p className="text-xs uppercase text-gray-500">Prepared for</p>
            <p className="font-semibold">{preparedFor?.name}</p>
            <p className="text-sm">{preparedFor?.company}</p>
            {preparedFor?.address && <p className="text-sm text-gray-600">{preparedFor.address}</p>}
          </Card>
          <Card>
            <p className="text-xs uppercase text-gray-500">Prepared by</p>
            <div className="mt-2 space-y-3">
              {preparedBy.map((c, i)=> (
                <div key={i} className="flex items-start gap-3">
                  {c.headshotUrl && <img src={c.headshotUrl} alt={c.name} className="w-10 h-10 rounded-md object-cover"/>}
                  <div>
                    <p className="font-semibold leading-tight">{c.name}</p>
                    <p className="text-sm text-gray-700 leading-tight">{c.title}{c.license?` · ${c.license}`:""}</p>
                    {c.phone && <p className="text-sm text-gray-600">{c.phone}</p>}
                    {c.email && <p className="text-sm text-gray-600">{c.email}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Footer strip */}
      <div className="absolute bottom-0 left-0 right-0 py-3 border-t bg-white/90 print:bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="logo" className="h-6" />}
          <span className="text-sm">{firmName}</span>
        </div>
        <div className="text-sm text-gray-600">{firmAddress} · {firmPhone} · {firmSite}</div>
      </div>
    </section>
  );
};

// ---------- Table Components ----------
const Th: React.FC<{children:React.ReactNode}> = ({ children }) => (
  <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase text-gray-600 border-b">{children}</th>
);
const Td: React.FC<{children:React.ReactNode; className?:string}> = ({ children, className }) => (
  <td className={"px-3 py-2 align-top text-sm border-b "+(className||"")}>{children}</td>
);

const AvailabilityTable: React.FC<{rows: AvailabilityRow[]}> = ({ rows }) => (
  <section className="px-10 py-10 print:break-after-page">
    <SectionTitle>Available for Lease/Sale (20,000–30,000 SF)</SectionTitle>
    <div className="overflow-hidden mt-4 border rounded-xl">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <Th>Building</Th>
            <Th>Property</Th>
            <Th>Size</Th>
            <Th>Asking Rate</Th>
            <Th>Net/CAM Expense</Th>
            <Th>Comments</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i)=> (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <Td>
                {r.photoUrl && (
                  <img src={r.photoUrl} alt={r.building} className="w-36 h-24 object-cover rounded-md mb-2"/>
                )}
                <div className="font-medium">{r.building}</div>
              </Td>
              <Td>{r.property}</Td>
              <Td>{r.size}</Td>
              <Td>{r.askingRate}</Td>
              <Td>{r.netCamExpense}</Td>
              <Td className="max-w-[22rem]">{r.comments}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const LeaseCompsTable: React.FC<{rows: LeaseCompRow[]}> = ({ rows }) => (
  <section className="px-10 py-10 print:break-after-page">
    <SectionTitle>Recent Lease Comps</SectionTitle>
    <div className="overflow-hidden mt-4 border rounded-xl">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <Th>Building</Th>
            <Th>Property</Th>
            <Th>Term (mo)</Th>
            <Th>Size</Th>
            <Th>Type</Th>
            <Th>Asking Rate</Th>
            <Th>1st Yr Deal Rate</Th>
            <Th>Increases</Th>
            <Th>Free Rent</Th>
            <Th>Start/DOM</Th>
            <Th>TI's</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i)=> (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <Td>
                {r.photoUrl && <img src={r.photoUrl} alt={r.building} className="w-36 h-24 object-cover rounded-md mb-2"/>}
                <div className="font-medium">{r.building}</div>
              </Td>
              <Td>{r.property}</Td>
              <Td>{r.termMonths}</Td>
              <Td>{r.size}</Td>
              <Td>{r.type}</Td>
              <Td>{r.askingRate}</Td>
              <Td>{r.dealRate}</Td>
              <Td>{r.increases}</Td>
              <Td>{r.freeRent}</Td>
              <Td>{r.startDateDom}</Td>
              <Td>{r.tis}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const TransactionsTable: React.FC<{rows: TransactionRow[]; title?: string}> = ({ rows, title = "Team – Recently Completed Transactions" }) => (
  <section className="px-10 py-10 print:break-after-page">
    <SectionTitle>{title}</SectionTitle>
    <div className="overflow-hidden mt-4 border rounded-xl">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <Th>Building</Th>
            <Th>Property</Th>
            <Th>Transaction Date</Th>
            <Th>Size</Th>
            <Th>Sale/Lease</Th>
            <Th>Party Represented</Th>
            <Th>Price</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i)=> (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <Td>
                {r.photoUrl && <img src={r.photoUrl} alt={r.building} className="w-36 h-24 object-cover rounded-md mb-2"/>}
                <div className="font-medium">{r.building}</div>
              </Td>
              <Td>{r.property}</Td>
              <Td>{r.date}</Td>
              <Td>{r.size}</Td>
              <Td>{r.saleOrLease}</Td>
              <Td>{r.party}</Td>
              <Td>{r.price || "—"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

// ---------- Recommendations Page ----------
const RecommendationsPage: React.FC<{rec: Recommendations}> = ({ rec }) => (
  <section className="px-10 py-10 print:break-after-page">
    <SectionTitle>Recommendations</SectionTitle>
    <div className="grid grid-cols-12 gap-6 mt-4">
      <div className="col-span-12 lg:col-span-6">
        <Card>
          {rec.photoUrl ? (
            <img src={rec.photoUrl} alt="subject" className="w-full h-64 object-cover rounded-xl" />
          ) : (
            <div className="w-full h-64 bg-gray-100 rounded-xl grid place-items-center text-gray-500">Subject photo</div>
          )}
        </Card>
      </div>
      <div className="col-span-12 lg:col-span-6 space-y-3">
        <h3 className="text-2xl font-bold">{rec.addressHeading}</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px]">
          <div className="text-gray-600">Asking Lease Rate:</div>
          <div className="font-medium">{rec.askingLeaseRate}</div>
          <div className="text-gray-600">Expected First Year Rate:</div>
          <div className="font-medium">{rec.expectedFirstYearRate}</div>
          <div className="text-gray-600">Term:</div>
          <div className="font-medium">{rec.term}</div>
          <div className="text-gray-600">Annual Rental Increases:</div>
          <div className="font-medium">{rec.increases}</div>
          <div className="text-gray-600">Free Rent:</div>
          <div className="font-medium">{rec.freeRent}</div>
          <div className="text-gray-600">Tenant Improvements:</div>
          <div className="font-medium whitespace-pre-line">{rec.tenantImprovements}</div>
          <div className="text-gray-600">Time on Market:</div>
          <div className="font-medium">{rec.timeOnMarket}</div>
        </div>
      </div>
    </div>
  </section>
);

// ---------- Main Component ----------
export default function MarketingPackage({ data }: { data: MarketingPackageData }) {
  // Print helper (browser PDF export)
  const onPrint = () => window.print();

  return (
    <div className="bg-white text-gray-900">
      {/* Print styles */}
      <style>{`
        @page { margin: 20mm; }
        @media print {
          .print\\:break-after-page { break-after: page; }
        }
      `}</style>

      {/* Cover */}
      <CoverPage data={data} />

      {/* Availability */}
      <AvailabilityTable rows={data.availabilityRows} />

      {/* Lease comps */}
      <LeaseCompsTable rows={data.leaseCompRows} />

      {/* Transactions */}
      <TransactionsTable rows={data.recentTransactions} />

      {/* Recommendations */}
      <RecommendationsPage rec={data.recommendations} />

      {/* Floating actions */}
      <div className="fixed bottom-4 right-4 flex gap-2 print:hidden">
        <button onClick={onPrint} className="px-4 py-2 rounded-full shadow bg-gold text-navy-dark font-semibold hover:bg-gold-light transition-colors">
          Export to PDF
        </button>
      </div>
    </div>
  );
}

// ---------- Example data ----------
export const exampleData: MarketingPackageData = {
  firmName: "Building Hawk | Commercial Real Estate Platform",
  firmAddress: "Orange County, California",
  firmPhone: "714.000.0000",
  firmSite: "www.buildinghawk.com",
  logoUrl: "",
  subject: {
    addressLine1: "4940 La Palma Avenue",
    cityState: "Anaheim, CA",
    heroImageUrl: "",
  },
  preparedFor: { name: "Client Name", company: "Company Name", address: "Address" },
  preparedBy: [
    { name: "Scott Seal", title: "Principal", license: "BRE #01412407", phone: "714.564.7159" },
  ],
  availabilityRows: [],
  leaseCompRows: [],
  recentTransactions: [],
  recommendations: {
    addressHeading: "4940 E. LA PALMA AVENUE, ANAHEIM, CA",
    askingLeaseRate: "$0.96 Gross PSF",
    expectedFirstYearRate: "$0.93 Gross PSF",
    term: "5 – 7 Years",
    increases: "Annual Fixed Increases of 3%",
    freeRent: "1–2 Months",
    tenantImprovements: "TBD",
    timeOnMarket: "2–4 Months",
    photoUrl: ""
  }
};

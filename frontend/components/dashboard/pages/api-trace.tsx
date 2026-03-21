'use client'

const LOGS = [
  {
    title: 'Transaction Status Check',
    status: '200 OK · 142ms',
    statusOk: true,
    code: `POST https://securegw.paytm.in/v3/order/status
# Paytm PG transaction verification
{
  "body": {
    "mid": "PTM_MERCH_9847221",
    "orderId": "ORDER_984721"
  }
}
─── Response ──────────────────────
{ "body": { "resultInfo": { "resultStatus": "TXN_SUCCESS",
    "resultCode": "01" }, "txnAmount": "2455.00",
    "txnId": "PTM20250321094512", "paymentMode": "UPI" } }`,
  },
  {
    title: 'Vision API — Receipt Scan',
    status: '200 OK · 1.2s',
    statusOk: true,
    code: `POST /api/v1/inventory/scan
# Multipart image upload → AI extraction
Content-Type: multipart/form-data
{ "merchant_id": "PTM_MERCH_9847221",
  "txn_id": "PTM20250321094512",
  "image": <binary> }
─── Response ──────────────────────
{ "items": [
    { "name": "Motichoor Laddoo", "qty": 2, "unit": "kg", "price": 480 },
    { "name": "Kaju Katli Box", "qty": 3, "unit": "pcs", "price": 1350 }
  ], "confidence": 0.93 }`,
  },
  {
    title: 'Inventory Entry Save',
    status: '201 Created · 88ms',
    statusOk: true,
    code: `POST /api/v1/inventory/entry
{ "merchant_id": "PTM_MERCH_9847221",
  "txn_id": "PTM20250321094512",
  "category": "sweets",
  "items": [ ... ],
  "customer_phone": "9876543210" }
─── Response ──────────────────────
{ "entry_id": "INV_20250321_0847",
  "status": "saved",
  "skus_updated": 3,
  "customer_linked": true }`,
  },
  {
    title: 'Customer Lookup',
    status: '200 OK · 61ms',
    statusOk: true,
    code: `GET /api/v1/customers/lookup?phone=9876543210&mid=PTM_MERCH_9847221
─── Response ──────────────────────
{ "found": true,
  "name": "Rajesh Kumar",
  "paytm_verified": true,
  "visit_count": 9,
  "total_spend": 8450,
  "segment": "loyal" }`,
  },
]

export function ApiTracePage() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#0D1B3E' }}>API Trace</h1>
          <p className="text-sm mt-0.5" style={{ color: '#7A8AAE' }}>Live request/response log — Paytm PG + Inventory APIs</p>
        </div>
        <button
          className="text-xs font-semibold px-3 py-2 rounded-lg border transition-all hover:bg-[#F5F7FD]"
          style={{ borderColor: '#DDE4F2', color: '#0D1B3E' }}
        >
          ↻ Refresh
        </button>
      </div>

      <div className="space-y-3">
        {LOGS.map((log, i) => (
          <div key={i} className="bg-white rounded-xl border p-4" style={{ borderColor: '#DDE4F2' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: '#0D1B3E' }}>{log.title}</span>
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-full"
                style={{ background: '#E4F8F1', color: '#008A5E' }}
              >
                {log.status}
              </span>
            </div>
            <div
              className="rounded-xl p-3 overflow-x-auto"
              style={{ background: '#0B1324', border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'DM Mono, monospace', fontSize: '11px', lineHeight: '1.7', color: '#5A7BA4' }}
            >
              <pre className="whitespace-pre-wrap break-all">{log.code}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

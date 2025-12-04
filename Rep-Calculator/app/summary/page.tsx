'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface LineItem {
  id: string;
  documentLineNumber?: string;
  quantity: string;
  description: string;
  rcv: number;
  acv?: number;
  checked: boolean;
  notes: string;
}

interface SupplementItem {
  id: string;
  title: string;
  quantity: string;
  amount: number;
}

interface Trade {
  id: string;
  name: string;
  checked: boolean;
  supplements: SupplementItem[];
  lineItems: LineItem[];
}

export default function SummaryPage() {
  const router = useRouter();
  const printableRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [deductible, setDeductible] = useState<number>(0);
  const [rep, setRep] = useState<string>('');
  const [workNotDoing, setWorkNotDoing] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [claimNumber, setClaimNumber] = useState<string>('');
  const [claimAdjuster, setClaimAdjuster] = useState<{ name: string; email: string }>({ name: '', email: '' });
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set());
  const [workDoingSummary, setWorkDoingSummary] = useState<string>('');
  const [workNotDoingSummary, setWorkNotDoingSummary] = useState<string>('');
  const [customer, setCustomer] = useState<{ displayName: string; address: string; jnid: string } | null>(null);
  const [sendingToJobNimbus, setSendingToJobNimbus] = useState(false);
  const [sendingError, setSendingError] = useState<string>('');

  // Load data from session storage
  useEffect(() => {
    const storedData = sessionStorage.getItem('scopeData');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        console.log('Summary page loaded scopeData:', parsed);
        if (parsed.trades && Array.isArray(parsed.trades)) {
          setTrades(parsed.trades);
          setDeductible(parsed.deductible || 0);
          setRep(parsed.rep || '');
          setWorkNotDoing(parsed.workNotDoing || '');
          setClaimNumber(parsed.claimNumber || '');
          setClaimAdjuster(parsed.claimAdjuster || { name: '', email: '' });
          setCustomer(parsed.customer || null);
          console.log('Customer data:', parsed.customer);

          // Generate summaries
          generateSummaries(parsed.trades);
        }
      } catch (e) {
        console.error('Error loading scope data:', e);
        router.push('/upload');
      }
    } else {
      router.push('/upload');
    }
    setLoading(false);
  }, [router]);

  // Generate AI summaries
  const generateSummaries = async (tradesData: Trade[]) => {
    try {
      const response = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: tradesData }),
      });

      if (response.ok) {
        const data = await response.json();
        setWorkDoingSummary(data.workDoingSummary || '');
        setWorkNotDoingSummary(data.workNotDoingSummary || '');
      } else {
        console.error('Failed to generate summary');
      }
    } catch (error) {
      console.error('Error generating summaries:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-lg font-medium text-muted-foreground">Loading summary...</p>
        </div>
      </div>
    );
  }

  const calculateTotals = () => {
    let totalRcv = 0;
    let totalAcv = 0;
    let totalSupplements = 0;
    let leftoverAcv = 0;
    const tradeTotals: { [key: string]: { rcv: number; acv: number } } = {};

    trades.forEach((trade) => {
      let tradeRcv = 0;
      let tradeAcv = 0;
      trade.lineItems.forEach((item) => {
        if (item.checked) {
          tradeRcv += item.rcv;
          if (item.acv) {
            tradeAcv += item.acv;
          }
        } else {
          if (item.acv) {
            leftoverAcv += item.acv;
          }
        }
      });

      const supplementTotal = trade.supplements.reduce((sum, supp) => sum + supp.amount, 0);
      tradeRcv += supplementTotal;
      tradeAcv += supplementTotal;

      tradeTotals[trade.name] = { rcv: tradeRcv, acv: tradeAcv };
      totalRcv += tradeRcv;
      totalAcv += tradeAcv;
      totalSupplements += supplementTotal;
    });

    return { totalRcv, totalAcv, tradeTotals, totalSupplements, leftoverAcv };
  };

  const { totalRcv, totalAcv, tradeTotals, totalSupplements, leftoverAcv } = calculateTotals();

  const toggleTradeExpanded = (tradeId: string) => {
    setExpandedTrades((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tradeId)) {
        newSet.delete(tradeId);
      } else {
        newSet.add(tradeId);
      }
      return newSet;
    });
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate PDF from screen capture (html2canvas) to preserve all styling
  const generatePDFFromCapture = async (element: HTMLElement): Promise<Blob> => {
    // Capture the element as a canvas image
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Get canvas dimensions
    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF({
      orientation: imgHeight > imgWidth ? 'portrait' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    let currentY = 0;
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Add image(s) to PDF, splitting across multiple pages if needed
    while (currentY < imgHeight) {
      if (currentY > 0) {
        pdf.addPage();
      }

      const remainingHeight = imgHeight - currentY;
      const heightToAdd = Math.min(pageHeight - 10, remainingHeight);

      // Calculate crop dimensions
      const cropTop = (currentY / imgHeight) * canvas.height;
      const cropHeight = (heightToAdd / imgHeight) * canvas.height;

      // Create temporary canvas for this page
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = cropHeight;
      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, cropTop, canvas.width, cropHeight, 0, 0, canvas.width, cropHeight);
      }

      const pageImgData = pageCanvas.toDataURL('image/png');
      pdf.addImage(pageImgData, 'PNG', 5, 5, imgWidth - 10, heightToAdd);

      currentY += heightToAdd;
    }

    return pdf.output('blob');
  };

  const handleDownloadPDF = async () => {
    if (!printableRef.current) return;

    try {
      const pdfBlob = await generatePDFFromCapture(printableRef.current);
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = customer?.displayName
        ? `scope-summary-${customer.displayName.replace(/\s+/g, '-').toLowerCase()}.pdf`
        : 'scope-summary.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF');
    }
  };

  const handleStartOver = () => {
    sessionStorage.removeItem('scopeData');
    router.push('/upload');
  };

  const handleSendToJobNimbus = async () => {
    if (!customer || !customer.jnid) {
      setSendingError('No customer selected. Please go back and select a customer.');
      return;
    }

    if (!printableRef.current) {
      setSendingError('Unable to generate PDF');
      return;
    }

    setSendingToJobNimbus(true);
    setSendingError('');

    try {
      // Generate PDF from screen capture
      const pdfBlob = await generatePDFFromCapture(printableRef.current);

      // Create FormData to send file directly to Zapier
      const formData = new FormData();
      formData.append('file', pdfBlob, 'Scope Summary.pdf');
      formData.append('related_id', customer.jnid);
      formData.append('attachment_type', 'Document');
      formData.append('description', 'Scope of Work Summary - Generated from Rep Calculator');
      formData.append('filename', 'Scope Summary.pdf');

      console.log('Sending PDF (screenshot-based) to Zapier webhook');

      // Send directly to Zapier webhook as FormData
      const zapierWebhookUrl = 'https://hooks.zapier.com/hooks/catch/24628620/u8ekbpf/';

      const response = await fetch(zapierWebhookUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Zapier webhook error:', errorText);
        throw new Error(`Failed to send to JobNimbus: ${response.status}`);
      }

      alert('Document sent to JobNimbus successfully!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send to JobNimbus';
      setSendingError(errorMessage);
      console.error('Error sending to JobNimbus:', error);
    } finally {
      setSendingToJobNimbus(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Control buttons (hidden from print) */}
        <div className="mb-6 flex gap-2 flex-wrap print:hidden">
          <Button onClick={handlePrint} variant="default" size="lg">
            🖨️ Print
          </Button>
          <Button onClick={handleDownloadPDF} variant="default" size="lg">
            📥 Download PDF
          </Button>
          <Button
            onClick={handleSendToJobNimbus}
            disabled={sendingToJobNimbus || !customer}
            variant="default"
            size="lg"
            className={customer ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {sendingToJobNimbus ? '⏳ Sending...' : !customer ? '⚠️ Select Customer First' : '📤 Send to JobNimbus'}
          </Button>
          <Button onClick={handleStartOver} variant="outline" size="lg">
            ↺ Start Over
          </Button>
        </div>
        {sendingError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded text-red-700 print:hidden">
            {sendingError}
          </div>
        )}

        {/* Printable content */}
        <div ref={printableRef} className="bg-white p-8">
          <div className="space-y-8">
            {/* Header */}
            <div className="text-center border-b pb-6">
              <h1 className="text-3xl font-bold mb-2">Scope of Work Summary</h1>
              <p className="text-gray-600">Insurance Claim Documentation</p>
            </div>

            {/* AI-Generated Work Summaries */}
            {(workDoingSummary || workNotDoingSummary) && (
              <div className="space-y-4">
                {workDoingSummary && (
                  <div className="border-l-4 border-blue-500 p-4 bg-blue-50 rounded">
                    <h3 className="text-lg font-bold text-blue-900 mb-2">Work Performing</h3>
                    <p className="text-gray-700">{workDoingSummary}</p>
                  </div>
                )}
                {workNotDoingSummary && (
                  <div className="border-l-4 border-orange-500 p-4 bg-orange-50 rounded">
                    <h3 className="text-lg font-bold text-orange-900 mb-2">Work Not Included</h3>
                    <p className="text-gray-700">{workNotDoingSummary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Rep and Claim info */}
            {(rep || claimNumber || claimAdjuster.name) && (
              <div className="grid grid-cols-3 gap-4 border p-4 rounded-lg bg-gray-50">
                {rep && (
                  <div>
                    <p className="text-sm text-gray-600 font-semibold">Rep:</p>
                    <p className="text-lg font-semibold">{rep}</p>
                  </div>
                )}
                {claimNumber && (
                  <div>
                    <p className="text-sm text-gray-600 font-semibold">Claim #:</p>
                    <p className="text-lg font-semibold">{claimNumber}</p>
                  </div>
                )}
                {claimAdjuster.name && (
                  <div>
                    <p className="text-sm text-gray-600 font-semibold">Adjuster:</p>
                    <p className="text-lg font-semibold">{claimAdjuster.name}</p>
                  </div>
                )}
              </div>
            )}

            {/* Scope breakdown by trade */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Scope of Work</h2>

              {trades.map((trade) => {
                const hasCheckedItems = trade.lineItems.some((item) => item.checked);
                const hasSupplements = trade.supplements.length > 0;

                if (!hasCheckedItems && !hasSupplements) return null;

                return (
                  <div key={trade.id} className="border rounded-lg p-4 space-y-3">
                    <button
                      data-trade-toggle
                      onClick={() => toggleTradeExpanded(trade.id)}
                      className="w-full text-left flex justify-between items-center border-b pb-2 hover:bg-gray-50 px-0 py-2 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{expandedTrades.has(trade.id) ? '▼' : '▶'}</span>
                        <h3 className="text-xl font-semibold">{trade.name}</h3>
                      </div>
                      <div className="flex gap-4 text-lg font-mono">
                        <span>Total Insurance Coverage: ${tradeTotals[trade.name]?.rcv.toLocaleString() || 0}</span>
                        {tradeTotals[trade.name]?.acv > 0 && (
                          <span>Total Upfront Money: ${tradeTotals[trade.name]?.acv.toLocaleString()}</span>
                        )}
                      </div>
                    </button>

                    <div data-trade-content style={{ display: expandedTrades.has(trade.id) ? 'block' : 'none' }}>
                      <>
                        {/* Line items - Checked items only */}
                        {trade.lineItems.filter((item) => item.checked).length > 0 && (
                          <div className="space-y-2">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="text-left p-2 font-semibold">Ref</th>
                                  <th className="text-left p-2 font-semibold">Quantity</th>
                                  <th className="text-left p-2 font-semibold">Description</th>
                                  <th className="text-right p-2 font-semibold">RCV</th>
                                  <th className="text-right p-2 font-semibold">ACV</th>
                                </tr>
                              </thead>
                              <tbody>
                                {trade.lineItems
                                  .filter((item) => item.checked)
                                  .map((item) => (
                                    <tr key={item.id} className="border-b hover:bg-gray-50">
                                      <td className="p-2 font-mono text-xs text-muted-foreground">{item.documentLineNumber || item.id}</td>
                                      <td className="p-2 font-mono text-gray-700">{item.quantity}</td>
                                      <td className="p-2">{item.description}</td>
                                      <td className="p-2 text-right font-mono">
                                        ${item.rcv.toLocaleString()}
                                      </td>
                                      <td className="p-2 text-right font-mono">
                                        {item.acv ? `$${item.acv.toLocaleString()}` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                            {trade.lineItems.some((item) => item.checked && item.notes) && (
                              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                <p className="text-xs font-semibold text-yellow-800 mb-1">Notes:</p>
                                {trade.lineItems
                                  .filter((item) => item.checked && item.notes)
                                  .map((item) => (
                                    <p key={item.id} className="text-xs text-yellow-900 mb-1">
                                      {item.description}: {item.notes}
                                    </p>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Unchecked line items - Work Not Doing for this trade */}
                        {trade.lineItems.filter((item) => !item.checked).length > 0 && (
                          <div className="space-y-2 pt-3 border-t border-red-200">
                            <div className="text-xs font-semibold text-red-700 mb-2">Work Not Doing:</div>
                            <table className="w-full text-sm">
                              <thead className="bg-red-50 border-b">
                                <tr>
                                  <th className="text-left p-2 font-semibold text-xs">Ref</th>
                                  <th className="text-left p-2 font-semibold text-xs">Quantity</th>
                                  <th className="text-left p-2 font-semibold text-xs">Description</th>
                                  <th className="text-right p-2 font-semibold text-xs">RCV</th>
                                  <th className="text-right p-2 font-semibold text-xs">ACV</th>
                                </tr>
                              </thead>
                              <tbody>
                                {trade.lineItems
                                  .filter((item) => !item.checked)
                                  .map((item) => (
                                    <tr key={item.id} className="border-b bg-red-50 opacity-60">
                                      <td className="p-2 font-mono text-xs text-muted-foreground">{item.documentLineNumber || item.id}</td>
                                      <td className="p-2 font-mono text-gray-700">{item.quantity}</td>
                                      <td className="p-2">{item.description}</td>
                                      <td className="p-2 text-right font-mono">
                                        ${item.rcv.toLocaleString()}
                                      </td>
                                      <td className="p-2 text-right font-mono">
                                        {item.acv ? `$${item.acv.toLocaleString()}` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Supplements */}
                        {trade.supplements.length > 0 && (
                          <div className="space-y-2 pt-3 border-t">
                            <p className="text-sm font-semibold text-yellow-800">Supplements:</p>
                            <table className="w-full text-sm">
                              <thead className="bg-yellow-50 border-b">
                                <tr>
                                  <th className="text-left p-2 font-semibold text-xs">Quantity</th>
                                  <th className="text-left p-2 font-semibold text-xs">Description</th>
                                  <th className="text-right p-2 font-semibold text-xs">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {trade.supplements.map((supp) => (
                                  <tr key={supp.id} className="border-b bg-yellow-50">
                                    <td className="p-2 font-mono text-gray-700">{supp.quantity}</td>
                                    <td className="p-2">{supp.title}</td>
                                    <td className="p-2 text-right font-mono">
                                      ${supp.amount.toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Work Not Doing section */}
            {workNotDoing && (
              <div className="border-2 border-red-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold mb-2">Work Not Included</h2>
                    <p className="text-sm whitespace-pre-wrap">{workNotDoing}</p>
                  </div>
                  {leftoverAcv > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-red-600 font-semibold mb-1">ACV Not Doing</p>
                      <p className="text-lg font-bold text-red-600 font-mono">${leftoverAcv.toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Financial summary */}
            <div className="border-t pt-6">
              <h2 className="text-2xl font-bold mb-4">Financial Breakdown - Scope of Work</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xl font-bold border-t pt-3">
                  <span>Total Replacement Cost Value (RCV):</span>
                  <span className="font-mono">${totalRcv.toLocaleString()}</span>
                </div>
                {totalAcv > 0 && (
                  <>
                    <div className="flex justify-between items-center text-xl font-bold">
                      <span>Total Actual Cash Value (ACV):</span>
                      <span className="font-mono">${totalAcv.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xl font-bold text-orange-600">
                      <span>Depreciation:</span>
                      <span className="font-mono">${(totalRcv - totalAcv).toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center text-xl font-bold">
                  <span>Deductible:</span>
                  <span className="font-mono">${deductible.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-xl font-bold">
                  <span>Supplements:</span>
                  <span className="font-mono">
                    Pending
                  </span>
                </div>
                {leftoverAcv > 0 && (
                  <div className="flex justify-between items-center text-sm text-muted-foreground border-t pt-3">
                    <span>Work Not Doing ACV (Available):</span>
                    <span className="font-mono">${leftoverAcv.toLocaleString()}</span>
                  </div>
                )}

                {/* Payment Schedule */}
                <div className="border-t pt-4 mt-4">
                  <h2 className="text-2xl font-bold mb-4">Payment Schedule</h2>
                  <div className="space-y-4">
                    {(() => {
                      const dueToday = totalAcv < (totalRcv * 0.5) ? totalAcv + deductible : (totalRcv * 0.5);
                      const dueSub = Math.max(0, totalAcv - dueToday);

                      return (
                        <>
                          {/* Deposit + Progress Payment Section */}
                          <div>
                            <div className="flex justify-between items-center bg-gray-50 p-2 mb-2 rounded">
                              <h3 className="text-lg font-bold">Deposit + Progress Payment (ACV Total)</h3>
                              <span className="font-mono font-bold text-lg">${(dueToday + dueSub).toLocaleString()}</span>
                            </div>
                            <div className="space-y-2">
                              {/* Due Today */}
                              <div className="flex justify-between items-center p-3 border rounded-lg">
                                <div>
                                  <p className="font-semibold">Due Today</p>
                                </div>
                                <span className="font-mono font-bold">${dueToday.toLocaleString()}</span>
                              </div>

                              {/* Due on Substantial Completion */}
                              {dueSub > 0 && (
                                <div className="flex justify-between items-center p-3 border rounded-lg">
                                  <div>
                                    <p className="font-semibold">Due on Substantial Completion</p>
                                    <p className="text-xs text-gray-600">ACV Balance</p>
                                  </div>
                                  <span className="font-mono font-bold">${dueSub.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Depreciation + Deductible Section */}
                          <div>
                            <div className="flex justify-between items-center bg-gray-50 p-2 mb-2 rounded">
                              <h3 className="text-lg font-bold">Depreciation + Deductible</h3>
                              <span className="font-mono font-bold text-lg">${((totalRcv - totalAcv) + deductible).toLocaleString()}</span>
                            </div>
                            <div className="space-y-2">
                              {totalAcv > 0 && (
                                <div className="flex justify-between items-center p-3 border rounded-lg">
                                  <div>
                                    <p className="font-semibold">Depreciation</p>
                                  </div>
                                  <span className="font-mono font-bold">${(totalRcv - totalAcv).toLocaleString()}</span>
                                </div>
                              )}

                              <div className="flex justify-between items-center p-3 border rounded-lg">
                                <div>
                                  <p className="font-semibold">Deductible</p>
                                </div>
                                <span className="font-mono font-bold">${deductible.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Supplements Section */}
                          <div>
                            <div className="flex justify-between items-center bg-gray-50 p-2 mb-2 rounded">
                              <h3 className="text-lg font-bold">Supplements</h3>
                              <span className="font-mono font-bold text-lg">{totalSupplements > 0 ? totalSupplements : 'Pending'}</span>
                            </div>
                            <div className="space-y-2">
                              {trades.some((trade) => trade.supplements.length > 0) && (
                                trades.map((trade) =>
                                  trade.supplements.map((supplement) => (
                                    <div key={supplement.id} className="flex justify-between items-center p-3 border rounded-lg">
                                      <div>
                                        <p className="font-semibold">{supplement.title}</p>
                                        <p className="text-xs text-gray-600">{supplement.quantity}</p>
                                      </div>
                                      <span className="font-mono font-bold">${supplement.amount.toLocaleString()}</span>
                                    </div>
                                  ))
                                )
                              )}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex justify-between items-center text-lg font-bold p-3 rounded border mt-4 bg-gray-50">
                  <span>Insurance Scope of Work Total:</span>
                  <span className="font-mono">${totalRcv.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t pt-6 text-center text-xs text-gray-600">
              <p className="mb-2">
                This document serves as a formal scope of work agreement for the insurance claim.
              </p>
              <p>
                Generated by Scope Builder | {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body {
            background: white;
          }
          .print\\:hidden {
            display: none !important;
          }

          /* Auto-expand all trades when printing */
          [data-trade-content] {
            display: block !important;
          }

          /* Hide collapse buttons when printing */
          button[data-trade-toggle] {
            display: none !important;
          }

          /* Portrait orientation for print */
          @page {
            size: A4 portrait;
            margin: 0.5in;
          }
        }
      `}</style>
    </div>
  );
}

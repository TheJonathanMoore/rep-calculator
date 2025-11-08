'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface LineItem {
  id: string;
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

export default function ReviewPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [deductible, setDeductible] = useState<number>(0);
  const [claimNumber, setClaimNumber] = useState<string>('');
  const [claimAdjuster, setClaimAdjuster] = useState<{ name: string; email: string }>({ name: '', email: '' });
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [expandedSupplements, setExpandedSupplements] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureData, setSignatureData] = useState({
    contractorName: '',
    homeownerName: '',
    homeownerEmail: '',
    signatureDate: new Date().toISOString().split('T')[0],
    signature: '' as string | null,
  });

  // Load data from session storage
  useEffect(() => {
    const storedData = sessionStorage.getItem('scopeData');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        if (parsed.trades && Array.isArray(parsed.trades)) {
          setTrades(parsed.trades);
          setDeductible(parsed.deductible || 0);
          setClaimNumber(parsed.claimNumber || '');
          setClaimAdjuster(parsed.claimAdjuster || { name: '', email: '' });
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

  if (loading) {
    return <div>Loading...</div>;
  }

  const toggleTrade = (tradeId: string) => {
    setTrades((prevTrades) =>
      prevTrades.map((trade) => {
        if (trade.id === tradeId) {
          const newChecked = !trade.checked;
          return {
            ...trade,
            checked: newChecked,
            lineItems: trade.lineItems.map((item) => ({
              ...item,
              checked: newChecked,
            })),
          };
        }
        return trade;
      })
    );
  };

  const toggleLineItem = (tradeId: string, itemId: string) => {
    setTrades((prevTrades) =>
      prevTrades.map((trade) => {
        if (trade.id === tradeId) {
          const updatedLineItems = trade.lineItems.map((item) =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
          );
          const allChecked = updatedLineItems.every((item) => item.checked);
          const noneChecked = updatedLineItems.every((item) => !item.checked);
          return {
            ...trade,
            lineItems: updatedLineItems,
            checked: allChecked || (!noneChecked && trade.checked),
          };
        }
        return trade;
      })
    );
  };

  const addSupplement = (tradeId: string) => {
    setTrades((prevTrades) =>
      prevTrades.map((trade) => {
        if (trade.id === tradeId) {
          return {
            ...trade,
            supplements: [
              ...trade.supplements,
              {
                id: `supp-${Date.now()}`,
                title: '',
                quantity: '',
                amount: 0,
              },
            ],
          };
        }
        return trade;
      })
    );
  };

  const updateSupplement = (
    tradeId: string,
    suppId: string,
    field: 'title' | 'quantity' | 'amount',
    value: string | number
  ) => {
    setTrades((prevTrades) =>
      prevTrades.map((trade) => {
        if (trade.id === tradeId) {
          return {
            ...trade,
            supplements: trade.supplements.map((supp) =>
              supp.id === suppId ? { ...supp, [field]: value } : supp
            ),
          };
        }
        return trade;
      })
    );
  };

  const removeSupplement = (tradeId: string, suppId: string) => {
    setTrades((prevTrades) =>
      prevTrades.map((trade) => {
        if (trade.id === tradeId) {
          return {
            ...trade,
            supplements: trade.supplements.filter((supp) => supp.id !== suppId),
          };
        }
        return trade;
      })
    );
  };

  const updateNotes = (tradeId: string, itemId: string, notes: string) => {
    setTrades((prevTrades) =>
      prevTrades.map((trade) => {
        if (trade.id === tradeId) {
          return {
            ...trade,
            lineItems: trade.lineItems.map((item) =>
              item.id === itemId ? { ...item, notes } : item
            ),
          };
        }
        return trade;
      })
    );
  };

  const toggleNoteExpanded = (itemId: string) => {
    setExpandedNotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleSupplementExpanded = (tradeId: string) => {
    setExpandedSupplements((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tradeId)) {
        newSet.delete(tradeId);
      } else {
        newSet.add(tradeId);
      }
      return newSet;
    });
  };

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
          // Add unchecked items to leftover ACV
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

  const calculateWorkNotDoing = () => {
    const uncheckedItems: string[] = [];

    trades.forEach((trade) => {
      // Check if trade is unchecked
      if (!trade.checked) {
        uncheckedItems.push(`${trade.name} (entire trade)`);
      } else {
        // Check for unchecked line items within checked trades
        trade.lineItems.forEach((item) => {
          if (!item.checked) {
            uncheckedItems.push(`${trade.name}: ${item.description}`);
          }
        });
      }
    });

    return uncheckedItems.join('\n');
  };

  const handleConfirmAndSign = () => {
    // Validate signature fields
    if (!signatureData.contractorName.trim() || !signatureData.homeownerName.trim()) {
      alert('Please fill in both contractor and homeowner names');
      return;
    }

    // Open signature modal instead of directly proceeding
    setShowSignatureModal(true);
  };

  const handleSignatureSave = (signatureImage: string) => {
    // Save signature to state
    setSignatureData((prev) => ({
      ...prev,
      signature: signatureImage,
    }));

    // Close modal
    setShowSignatureModal(false);

    // Calculate work not doing from unchecked items
    const workNotDoing = calculateWorkNotDoing();

    // Save complete data with signature and work not doing
    sessionStorage.setItem(
      'scopeData',
      JSON.stringify({
        trades,
        deductible,
        signature: {
          ...signatureData,
          signature: signatureImage,
        },
        workNotDoing,
      })
    );

    // Redirect to summary page
    router.push('/summary');
  };

  const handleGoBack = () => {
    router.push('/upload');
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Review Scope Breakdown
          </h1>
          <p className="text-muted-foreground">
            Review and confirm the extracted scope items, then sign to proceed
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main scope content */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Scope Items</CardTitle>
                <CardDescription>
                  Select trades and line items to include
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>⚠️ Please verify:</strong> Review all line items below to ensure completeness.
                    You can manually add any missing items as supplements.
                  </p>
                </div>

                <div className="space-y-6 max-h-[700px] overflow-y-auto pr-2">
                  {trades.map((trade) => (
                    <div key={trade.id} className="border rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <input
                          type="checkbox"
                          checked={trade.checked}
                          onChange={() => toggleTrade(trade.id)}
                          className="w-5 h-5 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{trade.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {trade.lineItems.length} line item{trade.lineItems.length !== 1 ? 's' : ''}
                          </p>
                          <div className="text-sm text-muted-foreground flex gap-4">
                            <span>
                              RCV: ${tradeTotals[trade.name]?.rcv.toLocaleString() || 0}
                            </span>
                            {tradeTotals[trade.name]?.acv > 0 && (
                              <span>
                                ACV: ${tradeTotals[trade.name]?.acv.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="ml-8 space-y-3">
                        {trade.lineItems.map((item) => (
                          <div key={item.id} className="space-y-2">
                            <div className="flex items-start gap-3">
                              <span className="text-xs text-muted-foreground mt-1 min-w-[60px]">
                                {item.id}
                              </span>
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => toggleLineItem(trade.id, item.id)}
                                className="w-4 h-4 cursor-pointer mt-1"
                              />
                              <div className="flex-1 space-y-1">
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1">
                                    <div className="flex gap-2 items-start">
                                      <span className="text-sm font-medium whitespace-nowrap">{item.quantity}</span>
                                      <span className="text-sm break-words">{item.description}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 flex-shrink-0">
                                    <div className="flex flex-col items-end gap-1 w-24">
                                      <div className="text-xs text-muted-foreground font-semibold">RCV</div>
                                      <span className="text-sm font-mono text-foreground whitespace-nowrap">
                                        ${item.rcv.toLocaleString()}
                                      </span>
                                    </div>
                                    {item.acv && (
                                      <div className="flex flex-col items-end gap-1 border-l pl-4 w-24">
                                        <div className="text-xs text-muted-foreground font-semibold">ACV</div>
                                        <span className="text-sm font-mono text-foreground whitespace-nowrap">
                                          ${item.acv.toLocaleString()}
                                        </span>
                                      </div>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleNoteExpanded(item.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      {expandedNotes.has(item.id) ? '−' : '+'}
                                    </Button>
                                  </div>
                                </div>
                                {expandedNotes.has(item.id) && (
                                  <Textarea
                                    placeholder="Add notes..."
                                    value={item.notes}
                                    onChange={(e) =>
                                      updateNotes(trade.id, item.id, e.target.value)
                                    }
                                    className="text-xs min-h-[60px]"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="ml-8 mt-4 pt-3 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-sm font-medium">Supplements</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSupplementExpanded(trade.id)}
                            className="h-6 w-6 p-0"
                          >
                            {expandedSupplements.has(trade.id) ? '−' : '+'}
                          </Button>
                        </div>

                        {expandedSupplements.has(trade.id) && (
                          <div className="space-y-3 mt-2">
                            {trade.supplements.map((supp) => (
                              <div key={supp.id} className="border rounded p-3 bg-yellow-50 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-yellow-800">SUPPLEMENT</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeSupplement(trade.id, supp.id)}
                                    className="h-6 w-6 p-0 text-red-600"
                                  >
                                    ×
                                  </Button>
                                </div>
                                <Input
                                  placeholder="Title/Description"
                                  value={supp.title}
                                  onChange={(e) =>
                                    updateSupplement(trade.id, supp.id, 'title', e.target.value)
                                  }
                                  className="text-sm"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  <Input
                                    placeholder="Quantity (e.g., 10 LF)"
                                    value={supp.quantity}
                                    onChange={(e) =>
                                      updateSupplement(trade.id, supp.id, 'quantity', e.target.value)
                                    }
                                    className="text-sm"
                                  />
                                  <Input
                                    type="number"
                                    placeholder="Amount ($)"
                                    value={supp.amount || ''}
                                    onChange={(e) =>
                                      updateSupplement(
                                        trade.id,
                                        supp.id,
                                        'amount',
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    className="text-sm"
                                  />
                                </div>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addSupplement(trade.id)}
                              className="w-full"
                            >
                              + Add Another Supplement
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-4 mt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Pending Supplements:</span>
                    <span className="text-sm font-mono">${totalSupplements.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-lg font-semibold">
                    <span>Total RCV:</span>
                    <span>${totalRcv.toLocaleString()}</span>
                  </div>
                  {totalAcv > 0 && (
                    <>
                      <div className="flex justify-between items-center text-lg font-semibold">
                        <span>Total ACV:</span>
                        <span>${totalAcv.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-lg font-semibold text-orange-600">
                        <span>Depreciation:</span>
                        <span>${(totalRcv - totalAcv).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {leftoverAcv > 0 && (
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <span>Leftover ACV (Work Not Doing):</span>
                      <span>${leftoverAcv.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t">
                    <Label htmlFor="deductible" className="text-sm">
                      Deductible
                    </Label>
                    <Input
                      id="deductible"
                      type="number"
                      value={deductible || ''}
                      onChange={(e) => setDeductible(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-lg">
                      <span>Insurance Will Pay:</span>
                      <span className="font-mono">${(totalRcv - deductible).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg">
                      <span>Homeowner Pays:</span>
                      <span className="font-mono">${deductible.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Signature sidebar */}
          <div>
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Confirm & Sign</CardTitle>
                <CardDescription>
                  Review and authorize this scope
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Insurance Claim Information */}
                {(claimNumber || claimAdjuster.name || claimAdjuster.email) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-900">Insurance Claim Details</p>
                    {claimNumber && (
                      <div className="text-xs">
                        <span className="text-blue-800 font-medium">Claim #:</span>
                        <span className="text-blue-700 ml-1">{claimNumber}</span>
                      </div>
                    )}
                    {claimAdjuster.name && (
                      <div className="text-xs">
                        <span className="text-blue-800 font-medium">Adjuster:</span>
                        <span className="text-blue-700 ml-1">{claimAdjuster.name}</span>
                      </div>
                    )}
                    {claimAdjuster.email && (
                      <div className="text-xs">
                        <span className="text-blue-800 font-medium">Email:</span>
                        <span className="text-blue-700 ml-1 break-all">{claimAdjuster.email}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="contractor-name" className="text-sm">
                    Company Rep / Contractor
                  </Label>
                  <select
                    id="contractor-name"
                    value={signatureData.contractorName}
                    onChange={(e) =>
                      setSignatureData({
                        ...signatureData,
                        contractorName: e.target.value,
                      })
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    <option value="">Select a representative...</option>
                    <option value="Colin Black">Colin Black</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="homeowner-name" className="text-sm">
                    Homeowner/Insured Name
                  </Label>
                  <Input
                    id="homeowner-name"
                    placeholder="Full name"
                    value={signatureData.homeownerName}
                    onChange={(e) =>
                      setSignatureData({
                        ...signatureData,
                        homeownerName: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="homeowner-email" className="text-sm">
                    Homeowner Email
                  </Label>
                  <Input
                    id="homeowner-email"
                    type="email"
                    placeholder="email@example.com"
                    value={signatureData.homeownerEmail}
                    onChange={(e) =>
                      setSignatureData({
                        ...signatureData,
                        homeownerEmail: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-gray-500">Send a copy of the summary to this address</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signature-date" className="text-sm">
                    Date
                  </Label>
                  <Input
                    id="signature-date"
                    type="date"
                    value={signatureData.signatureDate}
                    onChange={(e) =>
                      setSignatureData({
                        ...signatureData,
                        signatureDate: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  <p>
                    By confirming below, both parties agree to the scope of work and costs outlined above.
                  </p>
                </div>

                <div className="space-y-2 pt-4">
                  <Button
                    onClick={handleConfirmAndSign}
                    className="w-full"
                    size="lg"
                  >
                    Confirm & Proceed to Summary
                  </Button>
                  <Button
                    onClick={handleGoBack}
                    variant="outline"
                    className="w-full"
                  >
                    ← Back to Upload
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignatureModal
          homeownerName={signatureData.homeownerName}
          canvasRef={canvasRef}
          onSave={handleSignatureSave}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}
    </div>
  );
}

interface SignatureModalProps {
  homeownerName: string;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onSave: (signatureImage: string) => void;
  onCancel: () => void;
}

function SignatureModal({ homeownerName, canvasRef, onSave, onCancel }: SignatureModalProps) {
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const signatureImage = canvas.toDataURL('image/png');
    onSave(signatureImage);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Sign Document</CardTitle>
          <CardDescription>
            Please sign below to authorize the scope of work
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>
              <span className="font-semibold">Homeowner:</span> {homeownerName}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Signature</Label>
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="border-2 border-input rounded-lg bg-white cursor-crosshair w-full"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={clearSignature}
              className="flex-1"
              size="sm"
            >
              Clear
            </Button>
            <Button
              onClick={saveSignature}
              className="flex-1"
              size="sm"
            >
              Sign & Proceed
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={onCancel}
            className="w-full"
            size="sm"
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [deductible, setDeductible] = useState<number>(0);
  const [claimNumber, setClaimNumber] = useState<string>('');
  const [claimAdjuster, setClaimAdjuster] = useState<{ name: string; email: string }>({ name: '', email: '' });
  const [rep, setRep] = useState<string>('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [expandedSupplements, setExpandedSupplements] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

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
          setRep(parsed.rep || '');
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="text-lg font-medium text-muted-foreground">Loading scope data...</p>
        </div>
      </div>
    );
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

  const handleProceedToSummary = () => {
    // Calculate work not doing from unchecked items
    const workNotDoing = calculateWorkNotDoing();

    // Save complete data (preserve customer if it exists)
    const existingData = sessionStorage.getItem('scopeData');
    const parsedExisting = existingData ? JSON.parse(existingData) : {};

    sessionStorage.setItem(
      'scopeData',
      JSON.stringify({
        trades,
        deductible,
        claimNumber,
        claimAdjuster,
        rep,
        workNotDoing,
        customer: parsedExisting.customer || null,
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
                                <Input
                                  placeholder="Quantity (e.g., 10 LF)"
                                  value={supp.quantity}
                                  onChange={(e) =>
                                    updateSupplement(trade.id, supp.id, 'quantity', e.target.value)
                                  }
                                  className="text-sm"
                                />
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
                  {deductible > 0 && (
                    <div className="flex justify-between items-center text-lg font-semibold">
                      <span>Deductible:</span>
                      <span>${deductible.toLocaleString()}</span>
                    </div>
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

          {/* Summary sidebar */}
          <div>
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Calculation Summary</CardTitle>
                <CardDescription>
                  Review calculation details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Insurance Claim Information */}
                {(claimNumber || claimAdjuster.name || rep) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-900">Claim Details</p>
                    {claimNumber && (
                      <div className="text-xs">
                        <span className="text-blue-800 font-medium">Claim #:</span>
                        <span className="text-blue-700 ml-1">{claimNumber}</span>
                      </div>
                    )}
                    {rep && (
                      <div className="text-xs">
                        <span className="text-blue-800 font-medium">Rep:</span>
                        <span className="text-blue-700 ml-1">{rep}</span>
                      </div>
                    )}
                    {claimAdjuster.name && (
                      <div className="text-xs">
                        <span className="text-blue-800 font-medium">Adjuster:</span>
                        <span className="text-blue-700 ml-1">{claimAdjuster.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Calculation Proof Section */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Supplements:</span>
                      <span className="text-sm font-mono">${totalSupplements.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center font-semibold text-base">
                      <span>Total RCV:</span>
                      <span className="font-mono">${totalRcv.toLocaleString()}</span>
                    </div>
                    {totalAcv > 0 && (
                      <>
                        <div className="flex justify-between items-center font-semibold text-base">
                          <span>Total ACV:</span>
                          <span className="font-mono">${totalAcv.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-orange-600 font-semibold">
                          <span>Depreciation:</span>
                          <span className="font-mono">${(totalRcv - totalAcv).toLocaleString()}</span>
                        </div>
                      </>
                    )}
                    {leftoverAcv > 0 && (
                      <div className="flex justify-between items-center text-sm text-muted-foreground pt-2 border-t">
                        <span>Work Not Doing ACV:</span>
                        <span className="font-mono">${leftoverAcv.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

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

                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex justify-between items-center text-lg font-bold">
                      <span>Insurance Pays:</span>
                      <span className="font-mono">${Math.max(0, totalRcv - deductible).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg font-bold">
                      <span>Homeowner Pays:</span>
                      <span className="font-mono">${deductible.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-4">
                  <Button
                    onClick={handleProceedToSummary}
                    className="w-full"
                    size="lg"
                  >
                    Proceed to Summary
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

    </div>
  );
}

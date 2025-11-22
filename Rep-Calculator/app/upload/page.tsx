'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface JobNimbusCustomer {
  id: string;
  displayName: string;
  address: string;
  jnid: string;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [insuranceText, setInsuranceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [selectedRep, setSelectedRep] = useState('Colin Black');
  const [customerSearch, setCustomerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<JobNimbusCustomer[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<JobNimbusCustomer | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf'))) {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please select a valid PDF file');
      setFile(null);
    }
  };

  const handleCustomerSearch = async (query: string) => {
    setCustomerSearch(query);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearching(true);

    // Debounce the search
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search-jobnimbus?q=${encodeURIComponent(query)}`);
        if (response.ok) {
          const results = await response.json();
          setSearchResults(results);
          setShowSearchResults(true);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Search error:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectCustomer = (customer: JobNimbusCustomer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.displayName);
    setShowSearchResults(false);
  };

  const processDocumentWithGemini = async (fileToProcess: File) => {
    setExtractionStatus('Processing document with Gemini...');

    try {
      // Read file as base64
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToProcess);
      });

      setExtractionStatus('Analyzing insurance document...');

      // Determine MIME type
      const mimeType = fileToProcess.type || 'application/pdf';

      // Send to unified Gemini API for OCR + parsing
      const response = await fetch('/api/process-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileData,
          fileName: fileToProcess.name,
          mimeType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process document');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      setExtractionStatus('');
      throw error;
    }
  };

  const handleRead = async () => {
    if (inputMode === 'file' && !file) {
      setError('Please upload a PDF file');
      return;
    }

    if (inputMode === 'text' && !insuranceText.trim()) {
      setError('Please enter insurance document text');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let data;

      if (inputMode === 'file' && file) {
        // Process file with unified Gemini endpoint (OCR + parsing)
        data = await processDocumentWithGemini(file);
      } else {
        // For text mode, use Gemini text parsing
        setExtractionStatus('Analyzing insurance document text with Gemini...');

        const response = await fetch('/api/parse-text-with-gemini', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: insuranceText }),
        });

        setExtractionStatus('');

        let responseData;
        try {
          responseData = await response.json();
        } catch {
          throw new Error('Server returned an invalid response. Please try again.');
        }

        if (!response.ok) {
          throw new Error(responseData.error || 'Failed to parse insurance document');
        }

        data = responseData;
      }

      if (!data.trades || !Array.isArray(data.trades)) {
        throw new Error('Invalid data format received. Please try again.');
      }

      // Save parsed data to session storage
      sessionStorage.setItem(
        'scopeData',
        JSON.stringify({
          trades: data.trades,
          deductible: data.deductible || 0,
          claimNumber: data.claimNumber || '',
          claimAdjuster: data.claimAdjuster || { name: '', email: '' },
          rep: selectedRep,
          customer: selectedCustomer ? {
            displayName: selectedCustomer.displayName,
            address: selectedCustomer.address,
            jnid: selectedCustomer.jnid,
          } : null,
        })
      );

      // Redirect to review page
      router.push('/review');
    } catch (err) {
      console.error('Parse error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              {/* Calculator Icon */}
              <rect x="15" y="10" width="70" height="80" rx="4" fill="none" stroke="#1a3a52" strokeWidth="2"/>
              {/* Display */}
              <rect x="20" y="15" width="60" height="20" rx="2" fill="#1a3a52" opacity="0.1"/>
              {/* Button Grid */}
              {/* Row 1 */}
              <rect x="20" y="40" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="35" y="40" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="50" y="40" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="65" y="40" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              {/* Row 2 */}
              <rect x="20" y="54" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="35" y="54" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="50" y="54" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="65" y="54" width="12" height="10" rx="1" fill="#1a3a52" opacity="0.3"/>
              {/* Row 3 */}
              <rect x="20" y="68" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="35" y="68" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="50" y="68" width="12" height="10" rx="1" fill="none" stroke="#1a3a52" strokeWidth="1.5"/>
              <rect x="65" y="68" width="12" height="10" rx="1" fill="#1a3a52" opacity="0.3"/>
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Rep Calculator
          </h1>
          <p className="text-muted-foreground">
            AI-powered insurance document parser for construction scope extraction
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Insurance Document Input</CardTitle>
            <CardDescription>
              Upload a PDF or paste your insurance document for scope breakdown
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 mb-4">
              <Button
                variant={inputMode === 'file' ? 'default' : 'outline'}
                onClick={() => {
                  setInputMode('file');
                  setError('');
                }}
                size="sm"
              >
                Upload PDF
              </Button>
              <Button
                variant={inputMode === 'text' ? 'default' : 'outline'}
                onClick={() => {
                  setInputMode('text');
                  setError('');
                }}
                size="sm"
              >
                Paste Text
              </Button>
            </div>

            {inputMode === 'file' ? (
              <div className="space-y-4">
                {/* Hidden file input for click-to-upload */}
                <input
                  ref={fileInputRef}
                  id="insurance-file"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Drag and drop zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const droppedFiles = e.dataTransfer.files;
                    if (droppedFiles.length > 0) {
                      const droppedFile = droppedFiles[0];
                      if (droppedFile.type === 'application/pdf' || droppedFile.name.toLowerCase().endsWith('.pdf')) {
                        setFile(droppedFile);
                        setError('');
                      } else {
                        setError('Please select a valid PDF file');
                        setFile(null);
                      }
                    }
                  }}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                    file
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : 'border-muted-foreground/50 hover:border-muted-foreground bg-muted/30 hover:bg-muted/50'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="text-3xl">📄</div>
                    <div>
                      <p className="text-base font-medium">
                        {file ? 'File Ready' : 'Drag & Drop your PDF here'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {file ? file.name : 'or click the button below'}
                      </p>
                    </div>
                    {file && (
                      <button
                        onClick={() => {
                          setFile(null);
                          setError('');
                        }}
                        className="text-xs text-blue-600 hover:text-blue-700 underline"
                      >
                        Choose a different file
                      </button>
                    )}
                  </div>
                </div>

                {/* Click to upload button */}
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={file !== null}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  📁 Choose PDF File
                </Button>

                {extractionStatus && (
                  <div className="text-sm text-blue-600">
                    {extractionStatus}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="insurance-text">Insurance Document Text</Label>
                <Textarea
                  id="insurance-text"
                  placeholder="Paste your insurance document here..."
                  value={insuranceText}
                  onChange={(e) => setInsuranceText(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rep-select">Company Representative</Label>
              <select
                id="rep-select"
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="Colin Black">Colin Black</option>
                <option value="John Smith">John Smith</option>
                <option value="Sarah Johnson">Sarah Johnson</option>
              </select>
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="customer-search">Search Customer (JobNimbus)</Label>
              <Input
                id="customer-search"
                type="text"
                placeholder="Search by customer name..."
                value={customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
                className="w-full"
              />
              {selectedCustomer && (
                <div className="text-sm text-green-600 font-medium">
                  ✓ Selected: {selectedCustomer.displayName}
                </div>
              )}
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 border border-input rounded-md bg-background shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((customer) => (
                    <div
                      key={customer.id}
                      onClick={() => handleSelectCustomer(customer)}
                      className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                    >
                      <div className="font-medium text-sm">{customer.displayName}</div>
                      <div className="text-xs text-muted-foreground">{customer.address}</div>
                    </div>
                  ))}
                </div>
              )}
              {showSearchResults && searchResults.length === 0 && !searching && customerSearch.trim().length > 0 && (
                <div className="absolute z-10 w-full mt-1 border border-input rounded-md bg-background shadow-lg p-3 text-sm text-muted-foreground">
                  No customers found
                </div>
              )}
            </div>

            <Button
              onClick={handleRead}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? 'Reading...' : 'Read Document'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

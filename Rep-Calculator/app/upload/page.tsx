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
  const [file, setFile] = useState<File | null>(null);
  const [insuranceText, setInsuranceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState('');
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [quality, setQuality] = useState<'fast' | 'better'>('better');
  const [selectedRep, setSelectedRep] = useState('Colin Black');
  const [customerSearch, setCustomerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<JobNimbusCustomer[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<JobNimbusCustomer | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
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

  const extractTextFromFile = async (fileToProcess: File): Promise<string> => {
    setExtracting(true);
    setExtractionStatus('Extracting text from document...');

    try {
      const isPDF = fileToProcess.type === 'application/pdf' || fileToProcess.name.toLowerCase().endsWith('.pdf');

      if (isPDF) {
        // For PDFs, use server-side extraction
        return await extractTextFromPDF(fileToProcess);
      } else {
        // For images, use client-side OCR
        return await extractTextFromImage(fileToProcess);
      }
    } catch (err) {
      setExtractionStatus('');
      throw err;
    } finally {
      setExtracting(false);
    }
  };

  const extractTextFromPDF = async (fileToProcess: File): Promise<string> => {
    // Read file as base64
    const reader = new FileReader();
    const base64File = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileToProcess);
    });

    // Call extraction API
    const extractResponse = await fetch('/api/extract-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: base64File,
        filename: fileToProcess.name,
      }),
    });

    if (!extractResponse.ok) {
      let errorMessage = 'Failed to extract text from PDF';
      try {
        const errorData = await extractResponse.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        const errorText = await extractResponse.text();
        console.error('Extraction API error response:', errorText);
        errorMessage = `Server error (${extractResponse.status}): ${errorText.substring(0, 100)}`;
      }
      throw new Error(errorMessage);
    }

    let extractedData;
    try {
      extractedData = await extractResponse.json();
    } catch (e) {
      const text = await extractResponse.text();
      console.error('Failed to parse extraction response:', text.substring(0, 500));
      throw new Error('Invalid response from extraction API');
    }

    if (!extractedData.success && extractedData.requiresOCR) {
      // Scanned PDF - switch to OCR
      setExtractionStatus('PDF is scanned. Switching to OCR...');
      return await extractTextFromImage(fileToProcess);
    }

    if (!extractedData.text) {
      throw new Error('No text could be extracted from the document');
    }

    return extractedData.text;
  };

  const extractTextFromImage = async (fileToProcess: File): Promise<string> => {
    // Import Tesseract dynamically (client-side only)
    // @ts-ignore - dynamic import
    const Tesseract = (await import('tesseract.js')).default;

    setExtractionStatus(`Running OCR (${quality} quality)...`);

    // Read file as image data
    const reader = new FileReader();
    const imageData = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileToProcess);
    });

    // Create Tesseract worker
    const worker = await Tesseract.createWorker('eng', 1);

    try {
      if (quality === 'better') {
        // Better quality: higher accuracy settings
        setExtractionStatus('Running OCR with enhanced accuracy...');
        await worker.setParameters({
          tessedit_pagesegmode: Tesseract.PSM.AUTO_OSD,
          tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
        });
      }

      setExtractionStatus('Processing image...');
      const result = await worker.recognize(imageData);
      return result.data.text;
    } finally {
      await worker.terminate();
    }
  };

  const handleParse = async () => {
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
      let textToParse = '';

      if (inputMode === 'file' && file) {
        // Extract text from file first
        textToParse = await extractTextFromFile(file);
      } else {
        // Use text input directly
        textToParse = insuranceText;
      }

      // Now parse the extracted/provided text
      const formData = new FormData();
      formData.append('text', textToParse);

      const response = await fetch('/api/parse-scope', {
        method: 'POST',
        body: formData,
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Server returned an invalid response. Please try again.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse insurance document');
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
            <svg width="120" height="100" viewBox="0 0 1000 900" xmlns="http://www.w3.org/2000/svg">
              {/* Dark Blue Arrow Mark */}
              <g id="arrow-mark">
                {/* Left triangle */}
                <polygon points="330,250 400,400 330,400" fill="#1a3a52"/>
                {/* Middle parallelogram */}
                <polygon points="420,250 550,250 480,400 420,400" fill="#1a3a52"/>
                {/* Right parallelogram */}
                <polygon points="570,250 700,250 630,400 570,400" fill="#1a3a52"/>
              </g>
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            SimpleQuote
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
                <div className="space-y-2">
                  <Label htmlFor="insurance-file">Upload PDF</Label>
                  <Input
                    id="insurance-file"
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                    disabled={extracting}
                  />
                  {file && (
                    <p className="text-sm text-muted-foreground">
                      Selected: {file.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Extraction Quality</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="quality"
                        value="fast"
                        checked={quality === 'fast'}
                        onChange={(e) => setQuality(e.target.value as 'fast' | 'better')}
                        disabled={extracting}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">Fast (Basic)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="quality"
                        value="better"
                        checked={quality === 'better'}
                        onChange={(e) => setQuality(e.target.value as 'fast' | 'better')}
                        disabled={extracting}
                        className="cursor-pointer"
                      />
                      <span className="text-sm">Better (Recommended)</span>
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {quality === 'fast'
                      ? 'Fast mode: Quick text extraction, good for printed documents'
                      : 'Better mode: Advanced OCR, better accuracy for scanned documents'}
                  </p>
                </div>

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
              onClick={handleParse}
              disabled={loading || extracting}
              className="w-full"
              size="lg"
            >
              {extracting ? 'Extracting text...' : loading ? 'Parsing...' : 'Parse Document'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

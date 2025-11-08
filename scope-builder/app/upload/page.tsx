'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [insuranceText, setInsuranceText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');

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
      const formData = new FormData();

      if (inputMode === 'file' && file) {
        formData.append('file', file);
      } else {
        formData.append('text', insuranceText);
      }

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
              <div className="space-y-2">
                <Label htmlFor="insurance-file">Upload PDF</Label>
                <Input
                  id="insurance-file"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
                {file && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {file.name}
                  </p>
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
            <Button
              onClick={handleParse}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? 'Parsing...' : 'Parse Document'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

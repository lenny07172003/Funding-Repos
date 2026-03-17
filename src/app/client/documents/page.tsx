"use client";

import { useState, useEffect } from "react";

interface Doc {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  status: "pending" | "reviewed" | "approved" | "rejected";
}

const STORAGE_KEY = "funding_crm_client_docs";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setDocuments(JSON.parse(raw));
      } catch {}
    }
  }, []);

  function saveDocs(docs: Doc[]) {
    setDocuments(docs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  }

  function handleUpload(files: FileList | null) {
    if (!files) return;
    const newDocs: Doc[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      type: f.type || "document",
      uploadedAt: new Date().toISOString(),
      status: "pending" as const,
    }));
    saveDocs([...documents, ...newDocs]);
  }

  function handleDelete(id: string) {
    saveDocs(documents.filter((d) => d.id !== id));
  }

  const statusColors: Record<string, string> = {
    pending: "badge-yellow",
    reviewed: "badge-blue",
    approved: "badge-green",
    rejected: "badge-red",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-500 mt-1">Upload and manage your business funding documents</p>
      </div>

      {/* Upload Area */}
      <div
        className={`card border-2 border-dashed p-6 sm:p-12 text-center transition-colors ${
          dragActive ? "border-brand-500 bg-brand-50" : "border-gray-300"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
      >
        <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-600 mb-2">Drag and drop your files here, or</p>
        <label className="btn-primary cursor-pointer inline-block">
          Browse Files
          <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        </label>
        <p className="text-xs text-gray-400 mt-3">PDF, DOC, DOCX, JPG, PNG up to 10MB each</p>
      </div>

      {/* Document List */}
      {documents.length > 0 && (
        <>
          {/* Mobile card view */}
          <div className="mobile-card-list">
            {documents.map((doc) => (
              <div key={doc.id} className="mobile-card-item">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-5 h-5 text-brand-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="font-medium text-gray-900 text-sm truncate">{doc.name}</span>
                  </div>
                  <span className={statusColors[doc.status]}>
                    {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                  <button onClick={() => handleDelete(doc.id)} className="text-red-500 hover:text-red-700 text-sm">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="card overflow-hidden table-responsive">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Document</th>
                  <th className="table-header">Uploaded</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {doc.name}
                      </div>
                    </td>
                    <td className="table-cell">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="table-cell">
                      <span className={statusColors[doc.status]}>
                        {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <button onClick={() => handleDelete(doc.id)} className="text-red-500 hover:text-red-700 text-sm">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {documents.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No documents uploaded yet</p>
        </div>
      )}
    </div>
  );
}

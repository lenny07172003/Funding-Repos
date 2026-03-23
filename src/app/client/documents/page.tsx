"use client";

import { useState, useEffect } from "react";
import { getMyDocuments } from "@/lib/client-portal-actions";
import LoadingSpinner from "@/components/LoadingSpinner";

type Doc = Awaited<ReturnType<typeof getMyDocuments>>[number];

const statusColors: Record<string, string> = {
  pending: "badge-yellow",
  reviewed: "badge-blue",
  approved: "badge-green",
  rejected: "badge-red",
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getMyDocuments();
        setDocuments(data);
      } catch {
        // Documents load failed
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <LoadingSpinner message="Loading documents..." />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-gray-500 mt-1">View your business funding documents and their status</p>
      </div>

      {/* Document List */}
      {documents.length > 0 ? (
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
                  {doc.fileName && <span className="text-xs text-gray-400 truncate max-w-[150px]">{doc.fileName}</span>}
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
                  <th className="table-header">File</th>
                  <th className="table-header">Uploaded</th>
                  <th className="table-header">Status</th>
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
                    <td className="table-cell text-gray-500 text-sm">{doc.fileName || "—"}</td>
                    <td className="table-cell text-gray-500">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="table-cell">
                      <span className={statusColors[doc.status]}>
                        {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No documents yet. Your funding team will request documents as needed.</p>
        </div>
      )}

      <div className="card p-4 bg-brand-50 border-brand-200">
        <p className="text-sm text-brand-700">
          <strong>Need to submit a document?</strong> Contact your funding representative to upload documents to your account.
        </p>
      </div>
    </div>
  );
}

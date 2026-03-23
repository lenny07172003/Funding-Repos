import AdminNav from "@/components/AdminNav";
import BrandProvider from "@/components/BrandProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <BrandProvider>
      <div className="min-h-screen bg-gray-50">
        <AdminNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          {children}
        </main>
      </div>
    </BrandProvider>
  );
}

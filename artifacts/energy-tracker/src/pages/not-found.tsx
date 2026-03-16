import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Layout } from "@/components/layout";

export default function NotFound() {
  return (
    <Layout>
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="text-center bg-card border border-border rounded-3xl p-12 max-w-md shadow-2xl">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h1 className="text-4xl font-display font-bold text-foreground mb-4">404</h1>
          <p className="text-lg text-muted-foreground mb-8">
            The data visualization or page you are looking for does not exist.
          </p>
          <Link 
            href="/" 
            className="inline-block bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </Layout>
  );
}

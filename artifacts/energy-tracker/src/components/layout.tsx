import { Link, useRoute } from "wouter";
import { 
  LayoutDashboard, 
  TableProperties, 
  Map as MapIcon, 
  BarChart4,
  Menu,
  X,
  House,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const homeItem = { name: "Home", href: "/", icon: House };

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Deal Tracker", href: "/deals", icon: TableProperties },
  { name: "Interactive Map", href: "/map", icon: MapIcon },
  { name: "Vis Studio", href: "/studio", icon: BarChart4 },
  { name: "AI Discovery", href: "/discovery", icon: Sparkles },
];

function NavItem({ item }: { item: typeof navItems[number] }) {
  const [isActive] = useRoute(item.href);
  return (
    <Link key={item.href} href={item.href} className="block">
      <div
        className={`
          flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 group relative
          ${isActive 
            ? "bg-primary/10 text-primary font-medium" 
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          }
        `}
      >
        {isActive && (
          <motion.div 
            layoutId="sidebar-active" 
            className="absolute inset-0 border border-primary/20 bg-primary/5 rounded-xl -z-10"
            initial={false}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        <item.icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
        {item.name}
      </div>
    </Link>
  );
}

function MobileNavItem({ item, onClose }: { item: typeof navItems[number]; onClose: () => void }) {
  const [isActive] = useRoute(item.href);
  return (
    <Link href={item.href} onClick={onClose}>
      <div className={`
        flex items-center gap-4 px-4 py-4 rounded-xl text-lg
        ${isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground/70"}
      `}>
        <item.icon className="w-6 h-6" />
        {item.name}
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/30">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col bg-sidebar border-r border-sidebar-border relative z-20">
        <div className="h-20 flex items-center px-8 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-3 group cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <img 
                src={`${import.meta.env.BASE_URL}images/logo-icon.png`} 
                alt="AfriEnergy Logo" 
                className="w-6 h-6 object-contain filter brightness-0"
              />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-sidebar-foreground">
              AfriEnergy
            </span>
          </Link>
        </div>

        <nav className="flex-1 py-8 px-4 flex flex-col gap-2 overflow-y-auto">
          <NavItem item={homeItem} />
          <div className="px-4 mt-4 mb-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
            Analytics & Tools
          </div>
          {navItems.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}
        </nav>
        
        <div className="p-6 border-t border-sidebar-border">
          <div className="bg-sidebar-accent/50 rounded-2xl p-4 border border-sidebar-border/50">
            <h4 className="font-display font-semibold text-sm mb-1 text-sidebar-foreground">Data Update</h4>
            <p className="text-xs text-sidebar-foreground/60">Last synced: Today, 08:30 GMT</p>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-sidebar/95 backdrop-blur-md border-b border-sidebar-border z-50 flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <img 
              src={`${import.meta.env.BASE_URL}images/logo-icon.png`} 
              alt="Logo" 
              className="w-5 h-5 filter brightness-0"
            />
          </div>
          <span className="font-display font-bold text-lg">AfriEnergy</span>
        </Link>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-foreground/80 hover:text-foreground"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 z-40 bg-background/98 backdrop-blur-xl pt-20 px-4"
          >
            <nav className="flex flex-col gap-2 mt-4">
              <MobileNavItem item={homeItem} onClose={() => setMobileMenuOpen(false)} />
              <div className="px-4 pt-2 pb-1 text-xs font-semibold text-foreground/40 uppercase tracking-wider">
                Analytics & Tools
              </div>
              {navItems.map((item) => (
                <MobileNavItem key={item.href} item={item} onClose={() => setMobileMenuOpen(false)} />
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative pt-16 md:pt-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none -z-10" />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

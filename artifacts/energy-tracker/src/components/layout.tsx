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
  LogOut,
  Globe,
  Users,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminAuth } from "@/contexts/admin-auth";

const homeItem = { name: "Home", href: "/", icon: House };

const publicNavItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Deal Tracker", href: "/deals", icon: TableProperties },
  { name: "Interactive Map", href: "/map", icon: MapIcon },
  { name: "Countries", href: "/countries", icon: Globe },
  { name: "Investors", href: "/developers", icon: Users },
  { name: "Vis Studio", href: "/studio", icon: BarChart4 },
];

const adminNavItem = { name: "AI Discovery", href: "/discovery", icon: Sparkles };

function NavItem({ item }: { item: typeof publicNavItems[number] }) {
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

function MobileNavItem({ item, onClose }: { item: typeof publicNavItems[number]; onClose: () => void }) {
  const [isActive] = useRoute(item.href);
  return (
    <Link href={item.href} onClick={onClose}>
      <div className={`
        flex items-center gap-4 px-4 py-3.5 rounded-xl
        ${isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground/70 hover:bg-white/5 hover:text-foreground"}
        transition-colors
      `}>
        <item.icon className="w-5 h-5 shrink-0" />
        <span className="text-base font-medium">{item.name}</span>
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAdmin, logout } = useAdminAuth();

  const navItems = isAdmin
    ? [...publicNavItems, adminNavItem]
    : publicNavItems;

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
        
        <div className="p-6 border-t border-sidebar-border flex flex-col gap-3">
          <div className="bg-sidebar-accent/50 rounded-2xl p-4 border border-sidebar-border/50">
            <h4 className="font-display font-semibold text-sm mb-1 text-sidebar-foreground">Data Update</h4>
            <p className="text-xs text-sidebar-foreground/60">Last synced: Today, 08:30 GMT</p>
          </div>
          {isAdmin && (
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
            >
              <LogOut className="w-4 h-4" />
              Sign out of admin
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar/95 backdrop-blur-md border-b border-sidebar-border z-50 flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <img 
              src={`${import.meta.env.BASE_URL}images/logo-icon.png`} 
              alt="Logo" 
              className="w-5 h-5 filter brightness-0"
            />
          </div>
          <span className="font-display font-bold text-base">AfriEnergy</span>
        </Link>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-xl text-foreground/70 hover:text-foreground hover:bg-white/8 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Slide-out Drawer + Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Drawer panel */}
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 35 }}
              className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col"
            >
              {/* Drawer header */}
              <div className="h-14 flex items-center justify-between px-5 border-b border-sidebar-border shrink-0">
                <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-5 h-5 filter brightness-0" />
                  </div>
                  <span className="font-display font-bold text-base text-sidebar-foreground">AfriEnergy</span>
                </Link>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-lg text-foreground/50 hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Nav items */}
              <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
                <MobileNavItem item={homeItem} onClose={() => setMobileMenuOpen(false)} />
                <div className="px-4 pt-4 pb-1 text-[11px] font-semibold text-foreground/35 uppercase tracking-widest">
                  Analytics & Tools
                </div>
                {navItems.map((item) => (
                  <MobileNavItem key={item.href} item={item} onClose={() => setMobileMenuOpen(false)} />
                ))}
                {isAdmin && (
                  <button
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-base text-foreground/50 hover:bg-white/5 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign out of admin
                  </button>
                )}
              </nav>

              {/* Drawer footer */}
              <div className="p-4 border-t border-sidebar-border shrink-0">
                <div className="bg-sidebar-accent/50 rounded-xl p-3 border border-sidebar-border/50">
                  <p className="text-xs font-semibold text-sidebar-foreground/80">Data Update</p>
                  <p className="text-xs text-sidebar-foreground/50 mt-0.5">Last synced: Today, 08:30 GMT</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative pt-14 md:pt-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none -z-10" />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

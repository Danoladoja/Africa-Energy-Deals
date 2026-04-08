import { Link, useRoute, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  TableProperties, 
  Map as MapIcon, 
  BarChart4,
  Menu,
  X,
  House,
  Sparkles,
  Lightbulb,
  LogOut,
  Globe,
  Users,
  Bell,
  UserCircle2,
  Code2,
  Database,
  ClipboardList,
  Sun,
  Moon,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminAuth } from "@/contexts/admin-auth";
import { useAuth, authedFetch } from "@/contexts/auth";
import { useTheme } from "@/contexts/theme";
import { EmailGateModal } from "./email-gate-modal";
import { ChatSlideOut } from "./chat-slide-out";

const homeItem = { name: "Home", href: "/", icon: House };

const publicNavItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Insights", href: "/insights", icon: Lightbulb, badge: "AI" as const },
  { name: "Deal Tracker", href: "/deals", icon: TableProperties },
  { name: "Interactive Map", href: "/map", icon: MapIcon },
  { name: "Countries", href: "/countries", icon: Globe },
  { name: "Investors", href: "/developers", icon: Users },
  { name: "Vis Studio", href: "/studio", icon: BarChart4 },
];

const watchesNavItem = { name: "My Watches", href: "/watches", icon: Bell };

// Admin-only nav items
const adminNavItems = [
  { name: "Admin Dashboard", href: "/admin",     icon: Settings },
  { name: "AI Discovery",    href: "/discovery", icon: Sparkles },
];

// Reviewer nav items (visible to reviewers + admins)
const reviewerNavItems = [
  { name: "Review Portal",   href: "/review",    icon: ClipboardList },
];

type NavItemType = { name: string; href: string; icon: React.ElementType; badge?: string };

function NavItem({ item }: { item: NavItemType }) {
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
        <span className="flex-1">{item.name}</span>
        {item.badge && (
          <span className="text-[9px] font-bold bg-amber-500/20 text-amber-500 dark:text-amber-400 px-1.5 py-0.5 rounded-full">{item.badge}</span>
        )}
      </div>
    </Link>
  );
}

function MobileNavItem({ item, onClose }: { item: NavItemType; onClose: () => void }) {
  const [isActive] = useRoute(item.href);
  return (
    <Link href={item.href} onClick={onClose}>
      <div className={`
        flex items-center gap-4 px-4 py-3.5 rounded-xl
        ${isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground/70 hover:bg-white/5 hover:text-foreground"}
        transition-colors
      `}>
        <item.icon className="w-5 h-5 shrink-0" />
        <span className="text-base font-medium flex-1">{item.name}</span>
        {item.badge && (
          <span className="text-[9px] font-bold bg-amber-500/20 text-amber-500 dark:text-amber-400 px-1.5 py-0.5 rounded-full">{item.badge}</span>
        )}
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const { isAdmin, logout: adminLogout } = useAdminAuth();
  const { isAuthenticated, email, logout: userLogout, isReviewer } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();

  // Global keyboard shortcut: Cmd+K / Ctrl+K to open AI assistant
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setAiOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // "Analytics & Tools" is always just publicNavItems — admin/review items live in their own section
  const navItems = publicNavItems;
  // Administration section: shown only to admins and reviewers
  const showAdminSection = isAdmin || isReviewer;
  const administrationItems = isAdmin
    ? [...adminNavItems, ...reviewerNavItems]
    : reviewerNavItems;

  useEffect(() => {
    if (!isAuthenticated) { setBellCount(0); return; }
    authedFetch("/api/watches/bell-count")
      .then((r) => r.json())
      .then((d: { count?: number }) => setBellCount(d.count ?? 0))
      .catch(() => {});
  }, [isAuthenticated]);

  async function handleUserLogout() {
    await userLogout();
    navigate("/");
  }

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

          {showAdminSection && (
            <>
              <div className="px-4 mt-4 mb-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                Administration
              </div>
              {administrationItems.map((item) => (
                <NavItem key={item.href} item={item} />
              ))}
            </>
          )}

          <div className="px-4 mt-4 mb-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
            Developer
          </div>
          <NavItem item={{ name: "API Docs", href: "/api-docs", icon: Code2 }} />

          {isAuthenticated && (
            <>
              <div className="px-4 mt-4 mb-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                My Account
              </div>
              <Link href="/watches" className="block">
                <div className="flex items-center justify-between px-4 py-3.5 rounded-xl transition-all text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground group">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5" />
                    <span>My Watches</span>
                  </div>
                  {bellCount > 0 && (
                    <span className="text-xs font-bold bg-[#00e676] text-[#0b0f1a] px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {bellCount > 99 ? "99+" : bellCount}
                    </span>
                  )}
                </div>
              </Link>
            </>
          )}
        </nav>
        
        {/* Ask AI button */}
        <div className="px-4 pb-3">
          <button
            onClick={() => setAiOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#00e676]/8 border border-[#00e676]/20 text-[#00e676] hover:bg-[#00e676]/14 hover:border-[#00e676]/35 transition-all group"
          >
            <Sparkles className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-semibold flex-1 text-left">Ask AI</span>
            <kbd className="text-[10px] bg-[#00e676]/10 border border-[#00e676]/20 px-1.5 py-0.5 rounded text-[#00e676]/70 font-mono">⌘K</kbd>
          </button>
        </div>

        <div className="p-6 border-t border-sidebar-border flex flex-col gap-3">
          {/* Theme toggle */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-sidebar-foreground/50 font-medium">
              {theme === "dark" ? "Dark mode" : "Light mode"}
            </span>
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sidebar-border bg-sidebar-accent/60 hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-all text-xs font-medium"
            >
              {theme === "dark"
                ? <Sun className="w-3.5 h-3.5" />
                : <Moon className="w-3.5 h-3.5" />
              }
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>

          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <UserCircle2 className="w-4 h-4 text-sidebar-foreground/40 shrink-0" />
              <span className="text-xs text-sidebar-foreground/50 truncate flex-1">{email}</span>
              <button
                onClick={handleUserLogout}
                title="Sign out"
                className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#00e676]/10 border border-[#00e676]/25 text-[#00e676] hover:bg-[#00e676]/15 transition-colors w-full"
            >
              <Bell className="w-4 h-4" />
              Sign In for Alerts
            </button>
          )}
          {isAdmin && (
            <button
              onClick={adminLogout}
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
        <div className="flex items-center gap-1">
          {isAuthenticated ? (
            <Link href="/watches">
              <button className="relative p-2 rounded-xl text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                <Bell className="w-5 h-5" />
                {bellCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-[#00e676] text-[#0b0f1a] text-[10px] font-bold rounded-full flex items-center justify-center">
                    {bellCount > 9 ? "9+" : bellCount}
                  </span>
                )}
              </button>
            </Link>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="p-2 rounded-xl text-[#00e676] hover:bg-[#00e676]/10 transition-colors"
              title="Sign In"
            >
              <Bell className="w-5 h-5" />
            </button>
          )}
          {/* Theme toggle — mobile header */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="p-2 rounded-xl text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-out Drawer + Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 35 }}
              className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-sidebar border-r border-sidebar-border flex flex-col"
            >
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

              <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
                {/* Ask AI — mobile drawer */}
                <button
                  onClick={() => { setAiOpen(true); setMobileMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#00e676]/8 border border-[#00e676]/20 text-[#00e676] hover:bg-[#00e676]/14 transition-all mb-2"
                >
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <span className="text-base font-semibold">Ask AI</span>
                </button>

                <MobileNavItem item={homeItem} onClose={() => setMobileMenuOpen(false)} />
                <div className="px-4 pt-4 pb-1 text-[11px] font-semibold text-foreground/35 uppercase tracking-widest">
                  Analytics & Tools
                </div>
                {navItems.map((item) => (
                  <MobileNavItem key={item.href} item={item} onClose={() => setMobileMenuOpen(false)} />
                ))}

                {showAdminSection && (
                  <>
                    <div className="px-4 pt-4 pb-1 text-[11px] font-semibold text-foreground/35 uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3" />
                      Administration
                    </div>
                    {administrationItems.map((item) => (
                      <MobileNavItem key={item.href} item={item} onClose={() => setMobileMenuOpen(false)} />
                    ))}
                  </>
                )}
                {/* Theme toggle — mobile drawer */}
                <div className="flex items-center justify-between px-4 py-3 mt-2 rounded-xl bg-sidebar-accent/50">
                  <span className="text-sm text-sidebar-foreground/60 font-medium">
                    {theme === "dark" ? "Dark mode" : "Light mode"}
                  </span>
                  <button
                    onClick={toggleTheme}
                    title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sidebar-border bg-sidebar text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all text-xs font-semibold"
                  >
                    {theme === "dark"
                      ? <><Sun className="w-3.5 h-3.5" /> Light</>
                      : <><Moon className="w-3.5 h-3.5" /> Dark</>
                    }
                  </button>
                </div>

                {isAuthenticated && (
                  <>
                    <div className="px-4 pt-4 pb-1 text-[11px] font-semibold text-foreground/35 uppercase tracking-widest">
                      My Account
                    </div>
                    <Link href="/watches" onClick={() => setMobileMenuOpen(false)}>
                      <div className="flex items-center justify-between px-4 py-3.5 rounded-xl text-foreground/70 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-4">
                          <Bell className="w-5 h-5 shrink-0" />
                          <span className="text-base font-medium">My Watches</span>
                        </div>
                        {bellCount > 0 && (
                          <span className="text-xs font-bold bg-[#00e676] text-[#0b0f1a] px-1.5 py-0.5 rounded-full">
                            {bellCount > 99 ? "99+" : bellCount}
                          </span>
                        )}
                      </div>
                    </Link>
                    <button
                      onClick={() => { handleUserLogout(); setMobileMenuOpen(false); }}
                      className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-base text-foreground/50 hover:bg-white/5 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      Sign Out
                    </button>
                  </>
                )}
                {!isAuthenticated && (
                  <button
                    onClick={() => { setShowAuthModal(true); setMobileMenuOpen(false); }}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-base text-[#00e676] hover:bg-[#00e676]/10 transition-colors"
                  >
                    <Bell className="w-5 h-5" />
                    Sign In for Alerts
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => { adminLogout(); setMobileMenuOpen(false); }}
                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-base text-foreground/50 hover:bg-white/5 transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Sign out of admin
                  </button>
                )}
              </nav>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <EmailGateModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Chat Slide-out Panel (global, ⌘K) */}
      <ChatSlideOut open={aiOpen} onClose={() => setAiOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative pt-14 md:pt-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none -z-10" />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>

      {/* Floating Ask AI button — mobile only */}
      <AnimatePresence>
        {!aiOpen && (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={() => setAiOpen(true)}
            className="md:hidden fixed bottom-6 right-5 z-[1300] flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#00e676] text-[#0b0f1a] font-bold text-sm shadow-[0_4px_20px_rgba(0,230,118,0.4)] hover:shadow-[0_6px_28px_rgba(0,230,118,0.55)] transition-shadow"
          >
            <Sparkles className="w-4 h-4" />
            Ask AI
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

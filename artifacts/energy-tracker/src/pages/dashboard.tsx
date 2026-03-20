import { useGetSummaryStats, useGetStatsByYear, useGetStatsByTechnology, useGetStatsByRegion } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { PageTransition } from "@/components/page-transition";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell, Legend
} from "recharts";
import { Activity, Globe, Zap, DollarSign, TrendingUp, Briefcase } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareButton } from "@/components/share-button";

function formatCurrency(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetSummaryStats();
  const { data: yearStats, isLoading: loadingYears } = useGetStatsByYear();
  const { data: techStats, isLoading: loadingTech } = useGetStatsByTechnology();
  const { data: regionStats, isLoading: loadingRegion } = useGetStatsByRegion();

  const isLoading = loadingSummary || loadingYears || loadingTech || loadingRegion;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/90 backdrop-blur-sm border border-border p-3 rounded-lg shadow-xl">
          <p className="font-medium text-foreground mb-1">{label}</p>
          <p className="text-primary font-bold">
            {formatCurrency(payload[0].value)}
          </p>
          {payload[1] && (
            <p className="text-muted-foreground text-sm">
              {payload[1].value} Projects
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Layout>
      <PageTransition className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
        
        <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Market Overview</h1>
            <p className="text-muted-foreground text-lg">Comprehensive insights into Africa's energy transition investments.</p>
          </div>
          <ShareButton
            text={summary
              ? `🌍 Africa Energy Investment Tracker: ${formatCurrency(summary.totalInvestmentUsdMn)} across ${summary.totalProjects} projects in ${summary.totalCountries} countries. Track Africa's energy transition.`
              : "🌍 Africa Energy Investment Tracker — tracking energy investment across the continent."}
            variant="icon-label"
            className="border border-border rounded-xl px-3 py-2 bg-card hover:bg-muted self-start sm:self-auto"
          />
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          <StatCard 
            title="Total Investment" 
            value={summary ? formatCurrency(summary.totalInvestmentUsdMn) : ""} 
            icon={DollarSign} 
            loading={isLoading} 
            trend="+12% YoY"
            trendUp={true}
          />
          <StatCard 
            title="Active Projects" 
            value={summary?.activeProjects.toString() || ""} 
            icon={Activity} 
            loading={isLoading}
            trend="43 New this quarter"
          />
          <StatCard 
            title="Total Projects" 
            value={summary?.totalProjects.toString() || ""} 
            icon={Briefcase} 
            loading={isLoading}
          />
          <StatCard 
            title="Countries Covered" 
            value={summary?.totalCountries.toString() || ""} 
            icon={Globe} 
            loading={isLoading}
          />
          <StatCard 
            title="Technologies" 
            value={summary?.totalTechnologies.toString() || ""} 
            icon={Zap} 
            loading={isLoading}
          />
          <StatCard 
            title="Completed Projects" 
            value={summary?.completedProjects.toString() || ""} 
            icon={TrendingUp} 
            loading={isLoading}
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Investment Trend */}
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Investment Trajectory
            </h3>
            <div className="h-[220px] md:h-[300px] w-full">
              {isLoading ? <Skeleton className="w-full h-full rounded-xl" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={yearStats}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="year" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `$${val}M`}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="totalInvestmentUsdMn" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorValue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Technology Distribution */}
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              By Technology
            </h3>
            <div className="h-[220px] md:h-[300px] w-full">
              {isLoading ? <Skeleton className="w-full h-full rounded-xl" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={techStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={110}
                      paddingAngle={5}
                      dataKey="totalInvestmentUsdMn"
                      nameKey="technology"
                      stroke="none"
                    >
                      {techStats?.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      iconType="circle"
                      wrapperStyle={{ fontSize: '12px', color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Regional Distribution */}
          <div className="lg:col-span-2 bg-card border border-card-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Globe className="w-5 h-5 text-chart-3" />
              Regional Distribution
            </h3>
            <div className="h-[260px] md:h-[350px] w-full">
              {isLoading ? <Skeleton className="w-full h-full rounded-xl" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regionStats} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="region" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <YAxis 
                      yAxisId="left"
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(val) => `$${val}M`}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12}
                      tickLine={false} 
                      axisLine={false}
                    />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{fill: 'hsl(var(--muted)/0.3)'}} />
                    <Bar yAxisId="left" dataKey="totalInvestmentUsdMn" name="Investment (USD)" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} barSize={40} />
                    <Bar yAxisId="right" dataKey="projectCount" name="Projects" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>
      </PageTransition>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, loading, trend, trendUp }: { 
  title: string, value: string, icon: any, loading: boolean, trend?: string, trendUp?: boolean 
}) {
  return (
    <div className="bg-card border border-card-border rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Icon className="w-16 h-16 md:w-24 md:h-24 text-primary" />
      </div>
      <div className="flex items-center gap-2 md:gap-4 mb-3 md:mb-4 relative z-10">
        <div className="w-9 h-9 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
          <Icon className="w-4 h-4 md:w-6 md:h-6" />
        </div>
        <h3 className="font-semibold text-muted-foreground text-xs md:text-sm leading-tight">{title}</h3>
      </div>
      <div className="relative z-10">
        {loading ? (
          <Skeleton className="h-8 w-20 mb-1" />
        ) : (
          <div className="text-2xl md:text-4xl font-bold font-display tracking-tight text-foreground">
            {value}
          </div>
        )}
        {trend && (
          <div className={`text-xs md:text-sm mt-1 md:mt-2 font-medium ${trendUp ? 'text-primary' : 'text-muted-foreground'}`}>
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}

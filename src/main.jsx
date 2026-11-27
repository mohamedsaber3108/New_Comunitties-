import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
  Link,
  NavLink,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  ArrowUpLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Search,
  Menu,
  X,
  Sun,
  Moon,
  Users,
  CalendarDays,
  BriefcaseBusiness,
  GraduationCap,
  Rocket,
  PenLine,
  Sparkles,
  MessageCircle,
  Heart,
  Bookmark,
  Share2,
  Bell,
  Settings,
  LogOut,
  Plus,
  Shield,
  Building2,
  Gift,
  BookOpen,
  UserRound,
  Mail,
  MapPin,
  Clock,
  Globe2,
  Filter,
  Send,
  Flag,
  ExternalLink,
  Handshake,
  Target,
  MoveUpRight,
  ArrowDown,
  LockKeyhole,
  ShieldCheck,
  Lightbulb,
  Layers,
  LayoutDashboard,
  MoreHorizontal,
  CheckCircle2,
  Info,
  AlertCircle,
  RefreshCcw,
  ChartNoAxesCombined,
  FileText,
  CreditCard,
  BadgeCheck,
  ReceiptText,
} from "lucide-react";
import "./style.css";
import previewApi from "./preview-api.js";
import { guides } from "./resources-data.js";
import { programs, rooms, partners } from "./hub-content.js";
const PREVIEW_MODE = import.meta.env.VITE_SITE_PREVIEW === "true";

const API = "/api/v1";
async function api(url, options = {}) {
  if (PREVIEW_MODE) return previewApi(url, options);
  // `headers` must be merged AFTER spreading `options`. Spreading options last
  // replaced the whole headers object, so any call passing its own headers
  // (e.g. the checkout's Idempotency-Key) silently lost Content-Type and the
  // server received an unparsed body. This broke every paid checkout.
  const { headers, ...rest } = options;
  const r = await fetch(API + url, {
    credentials: "same-origin",
    ...rest,
    headers: { "Content-Type": "application/json", ...headers },
  });
  const json = await r.json().catch(() => ({}));
  // The server ended this session (staff idle or time limit, role change,
  // suspension, expiry): tell the app so it can sign the tab out and say so.
  if (r.status === 401 && json.error === "session_ended") window.dispatchEvent(new Event("usam:session-ended"));
  if (!r.ok) throw new Error(json.error || "request_failed");
  return json;
}
const AppContext = createContext(null);
function useApp() {
  return useContext(AppContext);
}
const personaData = [
  {
    slug: "launchpad",
    num: "01",
    name: "LaunchPad",
    ar: "روّاد الأعمال والمستثمرون",
    en: "Founders & investors",
    descAr:
      "من الفكرة إلى الشراكة. اعرض مشروعك، تعرّف على الخبرات المناسبة، وشارك في الحوارات التي تحرّك عملك.",
    descEn:
      "From an idea to the right partnership. Share your venture and connect with people who move it forward.",
    icon: Rocket,
    color: "terracotta",
    tagsAr: ["شركات ناشئة", "إرشاد", "استثمار"],
    tagsEn: ["Startups", "Mentorship", "Investment"],
  },
  {
    slug: "freelancespace",
    num: "02",
    name: "FreelanceSpace",
    ar: "المستقلون والعملاء",
    en: "Freelancers & clients",
    descAr:
      "مساحة تظهر فيها خبرتك بوضوح، وتتحول فيها العلاقات المهنية إلى تعاون حقيقي.",
    descEn:
      "A space to show your expertise clearly and turn professional connections into real collaboration.",
    icon: PenLine,
    color: "blue",
    tagsAr: ["ملفات أعمال", "تعاون", "خبرات"],
    tagsEn: ["Portfolios", "Collaboration", "Expertise"],
  },
  {
    slug: "hrconnect",
    num: "03",
    name: "HR Connect",
    ar: "أصحاب العمل والتوظيف",
    en: "Employers & recruiters",
    descAr:
      "تواصل مع المواهب بإذنها، وابنِ حضور مؤسستك، واكتشف مسارات التوظيف والتدريب.",
    descEn:
      "Connect with talent by consent, build your organization presence, and discover hiring pathways.",
    icon: BriefcaseBusiness,
    color: "violet",
    tagsAr: ["مواهب", "شركات", "تدريب"],
    tagsEn: ["Talent", "Organizations", "Internships"],
  },
  {
    slug: "studentzone",
    num: "04",
    name: "StudentZone",
    ar: "الطلاب والمواهب الصاعدة",
    en: "Students & early talent",
    descAr:
      "ابدأ من فضولك. شارك في مجموعات التعلم والتحديات، وابنِ شبكة تدعم خطوتك القادمة.",
    descEn:
      "Start with curiosity. Join learning circles and challenges and build a network for your next move.",
    icon: GraduationCap,
    color: "green",
    tagsAr: ["مجتمعات جامعية", "تعلم", "تحديات"],
    tagsEn: ["Campus", "Learning", "Challenges"],
  },
];
const labels = {
  ar: {
    home: "الرئيسية",
    communities: "المجتمعات",
    explore: "اكتشف",
    feed: "المنشورات",
    events: "الفعاليات",
    offers: "المزايا",
    members: "الأعضاء",
    organizations: "المؤسسات",
    mentors: "المرشدون",
    jobs: "الفرص",
    saved: "المحفوظات",
    notifications: "الإشعارات",
    settings: "الإعدادات",
    admin: "الإدارة",
    login: "تسجيل الدخول",
    signup: "انضم الآن",
    dashboard: "مساحتي",
    search: "بحث",
    viewAll: "عرض الكل",
    learnMore: "اكتشف أكثر",
    join: "انضم للمجتمع",
    leave: "مغادرة المجتمع",
    write: "اكتب منشورًا",
    publish: "نشر",
    cancel: "إلغاء",
    loading: "جارٍ التحميل…",
    retry: "إعادة المحاولة",
    empty: "لا يوجد محتوى منشور بعد",
    error: "تعذّر تحميل البيانات. تأكد من تشغيل الخادم وحاول مرة أخرى.",
    profile: "الملف الشخصي",
  },
  en: {
    home: "Home",
    communities: "Communities",
    explore: "Explore",
    feed: "Feed",
    events: "Events",
    offers: "Perks",
    members: "Members",
    organizations: "Organizations",
    mentors: "Mentors",
    jobs: "Opportunities",
    saved: "Saved",
    notifications: "Notifications",
    settings: "Settings",
    admin: "Admin",
    login: "Sign in",
    signup: "Join now",
    dashboard: "My space",
    search: "Search",
    viewAll: "View all",
    learnMore: "Explore more",
    join: "Join community",
    leave: "Leave community",
    write: "Write a post",
    publish: "Publish",
    cancel: "Cancel",
    loading: "Loading…",
    retry: "Try again",
    empty: "Nothing published here yet",
    error:
      "Could not load data. Check that the server is running and try again.",
    profile: "Profile",
  },
};
function useText() {
  const { lang } = useApp();
  return [labels[lang], (ar, en) => (lang === "ar" ? ar : en)];
}
function AppProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("usam-lang") || "ar");
  const [theme, setTheme] = useState(
    localStorage.getItem("usam-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  // Admin-managed platform configuration (feature flags + published CMS text).
  // Failure is non-fatal: with no config everything defaults to enabled/empty.
  const [platform, setPlatform] = useState({ flags: {}, content: {} });
  useEffect(() => {
    if (PREVIEW_MODE) return;
    api(`/platform-config?locale=${lang}`)
      .then((x) => setPlatform({ flags: x.flags || {}, content: x.content || {} }))
      .catch(() => {});
  }, [lang]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("usam-lang", lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("usam-theme", theme);
  }, [theme]);
  useEffect(() => {
    api("/me")
      .then((x) => setUser(x.user))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  // When the server ends a signed-in session mid-use, sign this tab out and
  // show a plain message instead of failing silently (UX judge, PR #5).
  const userRef = React.useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  useEffect(() => {
    const onEnded = () => {
      if (!userRef.current) return;
      setUser(null);
      setToast(
        lang === "ar"
          ? "انتهت جلستك. سجّل الدخول مرة أخرى للمتابعة."
          : "Your session ended. Sign in again to continue.",
      );
    };
    window.addEventListener("usam:session-ended", onEnded);
    return () => window.removeEventListener("usam:session-ended", onEnded);
  }, [lang]);
  useEffect(() => {
    if (toast) {
      // Longer for the session-ended notice so it can be read.
      const id = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  // Realtime: one Server-Sent Events stream per signed-in tab. Events carry
  // ids only; screens re-fetch through the normal API. `liveTick` bumps on
  // every event so badges refresh; `onLive` lets a screen react to a kind.
  const [liveTick, setLiveTick] = useState(0);
  const [liveListeners] = useState(() => new Set());
  useEffect(() => {
    if (PREVIEW_MODE || !user || typeof EventSource === "undefined") return;
    const es = new EventSource(API + "/stream");
    const relay = (kind) => (e) => {
      let data = null;
      try {
        data = JSON.parse(e.data);
      } catch {}
      setLiveTick((x) => x + 1);
      for (const fn of liveListeners) fn(kind, data);
    };
    for (const kind of ["notification", "message", "read"])
      es.addEventListener(kind, relay(kind));
    return () => es.close();
  }, [user?.id]);
  const onLive = (fn) => {
    liveListeners.add(fn);
    return () => liveListeners.delete(fn);
  };
  return (
    <AppContext.Provider
      value={{
        liveTick,
        onLive,
        lang,
        setLang,
        theme,
        setTheme,
        user,
        setUser,
        ready,
        toast,
        setToast,
        platform,
        // A flag that was never created counts as ON (matches the server).
        flag: (key) => platform.flags[key] !== false,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}
function Brand({ compact = false }) {
  return (
    <Link to="/" className="brand" aria-label="USAM Communities">
      <img className="brand-logo" src="/usam-wordmark.png" alt="USAM" />
      {!compact && (
        <span className="brand-type">
          <span>COMMUNITIES</span>
        </span>
      )}
    </Link>
  );
}
function Header() {
  const { lang, setLang, theme, setTheme, user } = useApp();
  const [t, L] = useText();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          if (PREVIEW_MODE) {
            e.preventDefault();
            document.getElementById("main")?.focus();
          }
        }}
      >
        {L("انتقل إلى المحتوى", "Skip to content")}
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Brand />
          <nav
            className="desktop-nav"
            aria-label={L("التنقل الرئيسي", "Main navigation")}
          >
            <NavLink to="/communities">{t.communities}</NavLink>
            <NavLink to="/feed">{t.feed}</NavLink>
            <NavLink to="/events">{t.events}</NavLink>
            <NavLink to="/programs">{L("البرامج", "Programs")}</NavLink>
            <NavLink to="/rooms">{L("الغرف", "Rooms")}</NavLink>
            <NavLink to="/pricing">{L("الاشتراكات", "Pricing")}</NavLink>
            <NavLink to="/perks">{L("المزايا", "Perks")}</NavLink>
            <NavLink to="/resources">{L("الموارد", "Resources")}</NavLink>
          </nav>
          <div className="header-actions">
            <button
              className="icon-btn small"
              aria-label={L("تغيير اللغة", "Change language")}
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            >
              <Globe2 size={18} />
              <span>{lang === "ar" ? "EN" : "ع"}</span>
            </button>
            <button
              className="icon-btn small theme-button"
              aria-label={L("تغيير المظهر", "Toggle theme")}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            {user ? (
              <Link className="button button-dark header-cta" to="/home">
                {t.dashboard}
                <ArrowUpLeft size={16} />
              </Link>
            ) : (
              <Link className="button button-dark header-cta" to="/signup">
                {t.signup}
                <ArrowUpLeft size={16} />
              </Link>
            )}
            <button
              className="icon-btn mobile-menu"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={L("القائمة", "Menu")}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {open && (
        <nav className="mobile-nav">
          <Link to="/communities">{t.communities}</Link>
          <Link to="/feed">{t.feed}</Link>
          <Link to="/events">{t.events}</Link>
          <Link to="/programs">{L("البرامج", "Programs")}</Link>
          <Link to="/rooms">{L("الغرف", "Rooms")}</Link>
          <Link to="/pricing">{L("الاشتراكات", "Pricing")}</Link>
          <Link to="/perks">{L("المزايا", "Perks")}</Link>
          <Link to="/resources">{L("الموارد", "Resources")}</Link>
          <Link to={user ? "/home" : "/signup"}>
            {user ? t.dashboard : t.signup}
          </Link>
        </nav>
      )}
    </>
  );
}
function Footer() {
  const [t, L] = useText();
  return (
    <footer className="footer">
      <div className="footer-top">
        <div>
          <Brand />
          <p>
            {L(
              "علاقات مهنية تصنع حركة حقيقية.",
              "Professional connections that lead somewhere real.",
            )}
          </p>
        </div>
        <div>
          <h4>{t.explore}</h4>
          <Link to="/communities">{t.communities}</Link>
          <Link to="/events">{t.events}</Link>
          <Link to="/programs">{L("البرامج", "Programs")}</Link>
          <Link to="/rooms">{L("الغرف المنسقة", "Curated rooms")}</Link>
          <Link to="/partners">{L("الشركاء", "Partners")}</Link>
          <Link to="/pricing">
            {L("الاشتراكات والأسعار", "Pricing & plans")}
          </Link>
          <Link to="/perks">{L("مزايا الأعضاء", "Member perks")}</Link>
          <Link to="/members">{t.members}</Link>
          <Link to="/organizations">{t.organizations}</Link>
          <Link to="/resources">{L("الموارد", "Resources")}</Link>
        </div>
        <div>
          <h4>{L("المنصة", "Platform")}</h4>
          <Link to="/how-it-works">{L("كيف تعمل", "How it works")}</Link>
          <Link to="/about">{L("عن المنصة", "About")}</Link>
          <Link to="/guidelines">{L("قواعد المجتمع", "Guidelines")}</Link>
          <Link to="/privacy">{L("الخصوصية", "Privacy")}</Link>
          <Link to="/terms">{L("الشروط", "Terms")}</Link>
          <Link to="/refund-policy">
            {L("الإلغاء والاسترداد", "Cancellation & refunds")}
          </Link>
          <Link to="/accessibility">
            {L("إمكانية الوصول", "Accessibility")}
          </Link>
          <Link to="/faq">{L("الأسئلة الشائعة", "FAQ")}</Link>
          <Link to="/contact">{L("تواصل معنا", "Contact")}</Link>
        </div>
        <div>
          <h4>{L("منظومة USAM", "USAM ecosystem")}</h4>
          <a href="https://usamif.com" target="_blank" rel="noreferrer">
            USAM <ExternalLink size={13} />
          </a>
          <a href="https://edu.usamif.com" target="_blank" rel="noreferrer">
            Education <ExternalLink size={13} />
          </a>
          <a href="https://jobs.usamif.com" target="_blank" rel="noreferrer">
            Career & Jobs <ExternalLink size={13} />
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} USAM Communities</span>
        <span>
          {L(
            "صُممت لتربط الطموح بالناس والفرص.",
            "Built to connect ambition with people and opportunity.",
          )}
        </span>
      </div>
    </footer>
  );
}
function SectionHead({ eyebrow, title, body, action, href }) {
  return (
    <div className="section-head">
      <div>
        <span className="eyebrow">
          <span className="eyebrow-line" />
          {eyebrow}
        </span>
        <h2>{title}</h2>
        {body && <p>{body}</p>}
      </div>
      {action && (
        <Link className="text-link" to={href}>
          {action}
          <ArrowUpLeft size={17} />
        </Link>
      )}
    </div>
  );
}
function PersonaCard({ item, large = false }) {
  const { lang } = useApp();
  const [t, L] = useText();
  const Icon = item.icon;
  return (
    <Link
      to={`/communities/${item.slug}`}
      className={`persona-card ${item.color} ${large ? "large" : ""}`}
    >
      <div className="persona-card-top">
        <span>{item.num} / 04</span>
        <span className="persona-icon">
          <Icon size={26} strokeWidth={1.7} />
        </span>
      </div>
      <div className="persona-card-body">
        <span className="persona-mini">
          {lang === "ar" ? item.ar : item.en}
        </span>
        <h3>{item.name}</h3>
        <p>{lang === "ar" ? item.descAr : item.descEn}</p>
      </div>
      <div className="persona-card-bottom">
        <div className="persona-tags">
          {(lang === "ar" ? item.tagsAr : item.tagsEn).map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <span className="round-arrow">
          <ArrowUpLeft size={21} />
        </span>
      </div>
    </Link>
  );
}
function HeroVisual() {
  const [t, L] = useText();
  return (
    <div
      className="hero-visual"
      aria-label={L(
        "تصوير لمسارات المنصة الأربعة",
        "Illustration of the four community pathways",
      )}
    >
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="hero-visual-head">
        <span className="tiny-dot" />
        {L("مساحة واحدة · مسارات متعددة", "ONE SPACE · MANY PATHWAYS")}
      </div>
      <div className="visual-line line-a" />
      <div className="visual-line line-b" />
      <div className="visual-center">
        <img className="visual-logo" src="/usam-wordmark.png" alt="" />
        <strong>COMMUNITIES</strong>
      </div>
      <div className="visual-chip chip-a">
        <span className="chip-icon orange">
          <Rocket size={18} />
        </span>
        <span>
          LaunchPad<small>{L("ابنِ فكرتك", "Build an idea")}</small>
        </span>
      </div>
      <div className="visual-chip chip-b">
        <span className="chip-icon blue">
          <PenLine size={18} />
        </span>
        <span>
          FreelanceSpace<small>{L("أظهر خبرتك", "Show your craft")}</small>
        </span>
      </div>
      <div className="visual-chip chip-c">
        <span className="chip-icon purple">
          <BriefcaseBusiness size={18} />
        </span>
        <span>
          HR Connect<small>{L("اكتشف المواهب", "Find talent")}</small>
        </span>
      </div>
      <div className="visual-chip chip-d">
        <span className="chip-icon green">
          <GraduationCap size={18} />
        </span>
        <span>
          StudentZone<small>{L("ابدأ رحلتك", "Start your path")}</small>
        </span>
      </div>
      <div className="visual-index">
        01 — 04 <span>✳</span>
      </div>
    </div>
  );
}
function Home() {
  const { user } = useApp();
  const [t, L] = useText();
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            {L(
              "الشبكة المهنية داخل منظومة USAM",
              "THE PROFESSIONAL NETWORK INSIDE USAM",
            )}
          </span>
          <h1>
            {L("المكان الذي", "The place where")}
            <br />
            <em>{L("تلتقي فيه", "people and")}</em>
            <br />
            {L("الفرص.", "possibilities meet.")}
          </h1>
          <p>
            {L(
              "أربع مجتمعات، هوية مهنية واحدة. تواصل مع أشخاص يشاركونك الطموح، وانقل فكرتك أو مهارتك إلى خطوتها التالية.",
              "Four communities, one professional identity. Meet people who share your ambition and take your idea or skill to its next step.",
            )}
          </p>
          <div className="hero-actions">
            <Link
              className="button button-accent"
              to={user ? "/home" : "/signup"}
            >
              {user ? t.dashboard : t.signup}
              <ArrowUpLeft size={19} />
            </Link>
            <Link className="button button-outline" to="/communities">
              {L("استكشف المجتمعات", "Explore communities")}
              <ArrowDown size={18} />
            </Link>
          </div>
          <div className="hero-foot">
            <span className="asterisk">✳</span>
            <span>
              {L(
                "مساحة مبنية لروّاد الأعمال، المستقلين، المؤسسات، والطلاب.",
                "Made for founders, independents, organizations, and students.",
              )}
            </span>
          </div>
        </div>
        <HeroVisual />
      </section>
      <section className="ticker" aria-label="USAM pathways">
        <div>
          IDEAS <span>✳</span> PEOPLE <span>✳</span> SKILLS <span>✳</span>{" "}
          OPPORTUNITY <span>✳</span> IDEAS <span>✳</span> PEOPLE{" "}
          <span>✳</span> SKILLS <span>✳</span> OPPORTUNITY
        </div>
      </section>
      <section className="section wrap" id="communities">
        <SectionHead
          eyebrow={L("اختر مساحتك", "FIND YOUR SPACE")}
          title={L("طريق مختلف لكل طموح.", "A path for every ambition.")}
          body={L(
            "كل مجتمع له تركيزه الخاص، وكلها متصلة بهويتك المهنية داخل USAM.",
            "Every community has its focus. All connect through your professional identity in USAM.",
          )}
          action={t.viewAll}
          href="/communities"
        />
        <div className="persona-grid">
          {personaData.map((item) => (
            <PersonaCard key={item.slug} item={item} />
          ))}
        </div>
      </section>
      <section className="section philosophy">
        <div className="wrap philosophy-grid">
          <div className="philosophy-copy">
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {L("لماذا المجتمعات؟", "WHY COMMUNITIES")}
            </span>
            <h2>
              {L(
                "العلاقة الصح ممكن تغيّر كل حاجة.",
                "The right connection changes everything.",
              )}
            </h2>
            <p>
              {L(
                "مجتمع USAM يجمع النقاشات المهنية والفعاليات والخبرات والفرص في مكان واضح. اختَر المجال الذي يخصك، وشارك بما تعرفه، واكتشف ما يمكن أن تبنيه مع الآخرين.",
                "USAM Communities brings professional conversations, events, expertise and opportunities together. Choose your space, contribute what you know, and discover what you can build with others.",
              )}
            </p>
            <Link className="button button-dark" to="/how-it-works">
              {L("كيف تعمل المنصة", "How the platform works")}
              <ArrowUpLeft size={17} />
            </Link>
          </div>
          <div className="steps">
            <div className="step">
              <b>01</b>
              <span>
                <Users size={24} />
                <strong>{L("هويتك واحدة", "One identity")}</strong>
                <small>
                  {L(
                    "ملف مهني يعبر عنك عبر المجتمعات الأربع.",
                    "A professional profile across all four communities.",
                  )}
                </small>
              </span>
            </div>
            <div className="step">
              <b>02</b>
              <span>
                <MessageCircle size={24} />
                <strong>
                  {L("المحادثة لها هدف", "Conversations with purpose")}
                </strong>
                <small>
                  {L(
                    "منشورات وتجارب وأسئلة بين أشخاص لهم نفس الاهتمام.",
                    "Posts, experiences and questions among people with shared interests.",
                  )}
                </small>
              </span>
            </div>
            <div className="step">
              <b>03</b>
              <span>
                <Target size={24} />
                <strong>
                  {L("الخطوة التالية أوضح", "A clearer next step")}
                </strong>
                <small>
                  {L(
                    "فعاليات وإرشاد وفرص ترتبط بما تبحث عنه.",
                    "Events, mentorship and opportunities relevant to you.",
                  )}
                </small>
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="section wrap">
        <SectionHead
          eyebrow={L("داخل المنصة", "INSIDE THE HUB")}
          title={L("كل شيء يتحرك معك.", "Everything moves with you.")}
          body={L(
            "مسارات عملية تبدأ بالمشاركة وتكبر بالتعاون.",
            "Practical pathways that start with participation and grow into collaboration.",
          )}
        />
        <div className="feature-grid">
          <Link to="/feed" className="feature feature-tall">
            <span className="feature-no">01 / COMMUNITY</span>
            <div className="feature-symbol">
              <MessageCircle size={54} strokeWidth={1} />
            </div>
            <div>
              <h3>
                {L("نقاشات تستحق وقتك.", "Conversations worth your time.")}
              </h3>
              <p>
                {L(
                  "شارك خبرتك، اسأل، وتابع ما يجري داخل مجتمعك المهني.",
                  "Share your expertise, ask questions and follow your community.",
                )}
              </p>
              <span className="text-link">
                {t.feed}
                <ArrowUpLeft size={17} />
              </span>
            </div>
          </Link>
          <Link to="/events" className="feature feature-orange">
            <span className="feature-no">02 / GATHER</span>
            <CalendarDays size={38} strokeWidth={1.2} />
            <h3>{L("تقابلوا في الحقيقة.", "Meet beyond the screen.")}</h3>
            <p>
              {L(
                "فعاليات وحوارات عملية يجمعها المجتمع.",
                "Events and practical conversations powered by the community.",
              )}
            </p>
            <span className="text-link">
              {t.events}
              <ArrowUpLeft size={17} />
            </span>
          </Link>
          <Link to="/mentors" className="feature feature-green">
            <span className="feature-no">03 / GROW</span>
            <Lightbulb size={38} strokeWidth={1.2} />
            <h3>{L("خبرة تختصر الطريق.", "Guidance that goes further.")}</h3>
            <p>
              {L(
                "اعثر على مرشدين يفتحون لك زاوية جديدة.",
                "Find mentors who can offer a new perspective.",
              )}
            </p>
            <span className="text-link">
              {t.mentors}
              <ArrowUpLeft size={17} />
            </span>
          </Link>
        </div>
      </section>
      <section className="section integration">
        <div className="wrap integration-inner">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {L("منظومة متصلة", "A CONNECTED ECOSYSTEM")}
            </span>
            <h2>
              {L("هنا تبدأ العلاقة.", "Connections start here.")}
              <br />
              <em>
                {L(
                  "والرحلة تكمل مع USAM.",
                  "Your journey continues with USAM.",
                )}
              </em>
            </h2>
            <p>
              {L(
                "التعليم، التطور المهني، العمل الحر، والوظائف لكل منها منصتها المتخصصة. المجتمعات تساعدك تكتشف الأشخاص والخطوة المناسبة. الانتقال بين المنتجات يتم بروابط واضحة؛ ربط الحسابات الموحد ما زال قيد التكامل.",
                "Education, career growth, freelancing and jobs each have their own product. Communities helps you discover people and the next step. Product links are available; unified account integration is still in progress.",
              )}
            </p>
          </div>
          <div className="integration-map">
            <a href="https://edu.usamif.com" target="_blank" rel="noreferrer">
              <BookOpen />
              USAM Education
              <ExternalLink size={15} />
            </a>
            <a href="https://jobs.usamif.com" target="_blank" rel="noreferrer">
              <BriefcaseBusiness />
              USAM Career & Jobs
              <ExternalLink size={15} />
            </a>
            <a
              href="https://freelancing-platform.usamif.com"
              target="_blank"
              rel="noreferrer"
            >
              <PenLine />
              USAM Freelancing
              <ExternalLink size={15} />
            </a>
            <div>
              <span className="integration-dot" />
              <strong>USAM Communities</strong>
              <small>{L("أنت هنا", "YOU ARE HERE")}</small>
            </div>
          </div>
        </div>
      </section>
      <section className="section wrap cta-section">
        <div className="cta-card">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            {L("خطوتك تبدأ هنا", "YOUR NEXT MOVE STARTS HERE")}
          </span>
          <h2>
            {L("المكان المناسب يغيّر", "The right space changes")}
            <br />
            {L("شكل الفرصة.", "what’s possible.")}
          </h2>
          <p>
            {L(
              "اختَر مجتمعك، وابدأ بمحادثة تستحق أن تُبنى عليها خطوة.",
              "Choose your community and start a conversation worth building on.",
            )}
          </p>
          <Link className="button button-light" to={user ? "/home" : "/signup"}>
            {user ? t.dashboard : t.signup}
            <ArrowUpLeft />
          </Link>
          <span className="cta-decor">✳</span>
        </div>
      </section>
    </>
  );
}
function PageHero({ eyebrow, title, body, icon: Icon }) {
  return (
    <div className="page-hero wrap">
      <div>
        <span className="eyebrow">
          <span className="eyebrow-line" />
          {eyebrow}
        </span>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {Icon && (
        <div className="page-hero-icon">
          <Icon size={70} strokeWidth={1} />
        </div>
      )}
    </div>
  );
}
function Empty({ icon: Icon = Layers, title, body, action, href }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={30} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && href && (
        <Link className="button button-outline" to={href}>
          {action}
          <ArrowUpLeft size={16} />
        </Link>
      )}
    </div>
  );
}
function Loadable({ loading, error, onRetry, children }) {
  const [t] = useText();
  if (loading)
    return (
      <div className="skeleton-grid" aria-label={t.loading}>
        {[0, 1, 2].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    );
  if (error)
    return (
      <div className="load-error">
        <Empty icon={AlertCircle} title={t.error} />
        <button onClick={onRetry || (() => window.location.reload())}>
          <RefreshCcw size={16} /> {t.retry}
        </button>
      </div>
    );
  return children;
}
function useData(url, refresh = 0, enabled = true) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [loadedUrl, setLoadedUrl] = useState(null);
  useEffect(() => {
    let active = true;
    if (!enabled || !url) {
      setData(null);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }
    // A refresh of the SAME url keeps showing the current data (no skeleton
    // flash on every live update); a different url starts clean.
    const sameUrl = loadedUrl === url && data !== null;
    if (!sameUrl) {
      setData(null);
      setLoading(true);
    }
    setError("");
    const target = url;
    api(url)
      .then((x) => {
        if (!active) return;
        setData(x);
        setLoadedUrl(target);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [url, refresh, enabled]);
  return { data, loading, error };
}
function Communities() {
  const [t, L] = useText();
  return (
    <>
      <PageHero
        eyebrow={L("أربع مساحات · شبكة واحدة", "FOUR SPACES · ONE NETWORK")}
        title={t.communities}
        body={L(
          "اكتشف المساحة اللي تشبه طموحك. يمكنك الانضمام لأكثر من مجتمع بنفس الحساب.",
          "Find the space that fits your ambition. One account can join more than one community.",
        )}
        icon={Users}
      />
      <div className="wrap page-content">
        <div className="persona-grid listing">
          {personaData.map((item) => (
            <PersonaCard large key={item.slug} item={item} />
          ))}
        </div>
      </div>
    </>
  );
}
function CommunityDetail() {
  const { slug } = useParams(),
    navigate = useNavigate();
  const item = personaData.find((p) => p.slug === slug);
  const { user, setToast, lang } = useApp();
  const [t, L] = useText();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData(`/communities/${slug}`, refresh);
  const feed = useData(`/posts?community=${slug}`, refresh);
  if (!item) return <NotFound />;
  const Icon = item.icon;
  async function membership() {
    if (!user)
      return navigate("/login", { state: { from: `/communities/${slug}` } });
    try {
      await api(`/communities/${slug}/join`, {
        method: data?.joined ? "DELETE" : "POST",
      });
      setRefresh((x) => x + 1);
      setToast(
        data?.joined
          ? L("غادرت المجتمع", "You left the community")
          : L("أهلًا بك في المجتمع", "Welcome to the community"),
      );
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <>
      <div className={`community-banner ${item.color}`}>
        <div className="wrap community-banner-inner">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            USAM COMMUNITIES / {item.num}
          </span>
          <div className="community-banner-title">
            <div>
              <span>{L(item.ar, item.en)}</span>
              <h1>{item.name}</h1>
              <p>{L(item.descAr, item.descEn)}</p>
              <button className="button button-dark" onClick={membership}>
                {data?.joined ? t.leave : t.join}
                <ArrowUpLeft size={17} />
              </button>
            </div>
            <div className="big-community-icon">
              <Icon size={104} strokeWidth={0.9} />
            </div>
          </div>
        </div>
      </div>
      <div className="wrap detail-layout">
        <div className="detail-main">
          <SectionHead
            eyebrow={L("داخل المجتمع", "IN THIS COMMUNITY")}
            title={L("أحدث النقاشات", "Latest conversations")}
          />
          <Loadable loading={feed.loading} error={feed.error}>
            {feed.data?.items?.length ? (
              <PostList
                posts={feed.data.items}
                onChange={() => setRefresh((x) => x + 1)}
              />
            ) : (
              <Empty
                icon={MessageCircle}
                title={L(
                  "أول محادثة تبدأ منك",
                  "The first conversation starts with you",
                )}
                body={L(
                  "انضم للمجتمع ثم شارك سؤالًا أو تجربة مهنية.",
                  "Join the community and share a question or professional insight.",
                )}
                action={data?.joined ? t.write : t.join}
                href={data?.joined ? `/feed?community=${slug}` : undefined}
              />
            )}
          </Loadable>
        </div>
        <aside className="detail-aside">
          <div className="aside-card">
            <span className="eyebrow">
              {L("عن المساحة", "ABOUT THIS SPACE")}
            </span>
            <h3>{L(item.ar, item.en)}</h3>
            <p>{L(item.descAr, item.descEn)}</p>
            <div className="aside-stat">
              <Users size={17} />
              <span>
                {loading ? "—" : (data?.membersCount ?? 0)}{" "}
                {L("عضو", "members")}
              </span>
            </div>
          </div>
          <div className="aside-card">
            <h3>{L("مسارات يمكن أن تبدأ بها", "Ways to get started")}</h3>
            {(lang === "ar" ? item.tagsAr : item.tagsEn).map((x, i) => (
              <div className="aside-link" key={x}>
                <span>0{i + 1}</span>
                {x}
                <ArrowUpLeft size={16} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
// Persistent prompt for members who haven't confirmed their email yet. Server
// enforces the restriction; this just tells them why actions are refused.
function VerifyEmailBanner() {
  const { user } = useApp();
  const [, L] = useText();
  if (PREVIEW_MODE || !user || user.emailVerified !== false) return null;
  return (
    <div className="announcement-banner" role="status">
      <Mail size={16} />
      <span>
        {L(
          "وثّق بريدك الإلكتروني لتفعيل النشر والانضمام والتسجيل.",
          "Verify your email to post, join and register.",
        )}{" "}
        <Link to="/settings">{L("إعادة إرسال الرابط", "Resend the link")}</Link>
      </span>
    </div>
  );
}
function AppShell({ children }) {
  const { user, lang, setLang, theme, setTheme, liveTick } = useApp();
  const [t, L] = useText();
  const [drawer, setDrawer] = useState(false);
  const navigate = useNavigate(),
    location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);
  // Unread badges, refreshed on live events and on navigation.
  const [navTick, setNavTick] = useState(0);
  useEffect(() => setNavTick((x) => x + 1), [location.pathname]);
  const unread = useData("/me/unread", liveTick + navTick, !PREVIEW_MODE && !!user).data;
  const badge = { "/messages": unread?.messages, "/notifications": unread?.notifications };
  const nav = [
    ["/home", LayoutDashboard, t.dashboard],
    ["/feed", MessageCircle, t.feed],
    ["/communities", Users, t.communities],
    ["/rooms", Layers, L("الغرف", "Rooms")],
    ["/programs", Target, L("البرامج", "Programs")],
    ["/pricing", CreditCard, L("الاشتراكات", "Pricing")],
    ["/resources", BookOpen, L("الموارد", "Resources")],
    ["/events", CalendarDays, t.events],
    ["/members", UserRound, t.members],
    ["/mentors", Lightbulb, t.mentors],
    ["/challenges", Target, L("التحديات", "Challenges")],
    ["/offers", Gift, t.offers],
    ["/organizations", Building2, t.organizations],
    ["/opportunities", Target, t.jobs],
  ];
  const personal = [
    ["/messages", Mail, L("الرسائل", "Messages")],
    ["/mentorship", Lightbulb, L("إرشادي", "Mentorship")],
    ["/my-submissions", FileText, L("مشاركاتي", "My submissions")],
    ["/saved", Bookmark, t.saved],
    ["/notifications", Bell, t.notifications],
    ["/activity", ChartNoAxesCombined, L("نشاطي", "My activity")],
    ["/my-events", CalendarDays, L("فعالياتي", "My events")],
    ["/participation", Layers, L("إدارة مشاركتي", "Participation hub")],
    ["/billing", ReceiptText, L("خطتي وفواتيري", "Plan & billing")],
    ["/settings", Settings, t.settings],
  ];
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    window.location.assign("/");
  }
  const side = (
    <>
      <div className="sidebar-logo">
        <Brand />
        <button
          onClick={() => setDrawer(false)}
          className="icon-btn sidebar-close"
        >
          <X size={20} />
        </button>
      </div>
      <div className="side-group-label">{L("مساحتك", "YOUR SPACE")}</div>
      <nav>
        {nav.map(([to, Icon, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `side-link ${isActive ? "active" : ""}`
            }
          >
            <Icon size={19} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="side-group-label second">{L("حسابك", "ACCOUNT")}</div>
      <nav>
        {personal.map(([to, Icon, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `side-link ${isActive ? "active" : ""}`
            }
          >
            <Icon size={19} strokeWidth={1.8} />
            {label}
            {badge[to] > 0 && (
              <span className="unread-badge side-badge" data-testid={`badge-${to.slice(1)}`}>
                {badge[to] > 99 ? "99+" : badge[to]}
              </span>
            )}
          </NavLink>
        ))}
        {["moderator", "admin", "super_admin"].includes(user?.role) && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `side-link ${isActive ? "active" : ""}`
            }
          >
            <Shield size={19} />
            {t.admin}
          </NavLink>
        )}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-callout">
          <span>✳</span>
          <strong>{L("مساحات تصنع فرقًا.", "Find your next move.")}</strong>
          <p>
            {L(
              "تعرف على مجتمع آخر يوسع دائرتك.",
              "Explore another community and widen your circle.",
            )}
          </p>
          <Link to="/communities">
            {t.communities}
            <ArrowUpLeft size={15} />
          </Link>
        </div>
        <button className="side-link logout" onClick={logout}>
          <LogOut size={18} />
          {L("تسجيل الخروج", "Sign out")}
        </button>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {L("انتقل إلى المحتوى", "Skip to content")}
      </a>
      <aside className={`sidebar ${drawer ? "open" : ""}`}>{side}</aside>
      {drawer && (
        <div className="drawer-scrim" onClick={() => setDrawer(false)} />
      )}
      <div className="app-body">
        <header className="app-topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setDrawer(true)}
            aria-label={L("افتح القائمة", "Open menu")}
          >
            <Menu size={21} />
          </button>
          <div className="topbar-crumb">
            USAM <span>/</span> {t.communities}
          </div>
          <div className="topbar-actions">
            <Link to="/search" className="topbar-search">
              <Search size={18} />
              <span>{t.search}</span>
              <kbd>⌘ K</kbd>
            </Link>
            <button
              className="icon-btn"
              aria-label={L("تغيير اللغة", "Change language")}
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            >
              <Globe2 size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label={L("تغيير المظهر", "Toggle theme")}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <Link
              to="/notifications"
              className="icon-btn"
              aria-label={t.notifications}
            >
              <Bell size={19} />
            </Link>
            <Link to="/me" className="topbar-avatar" title={user?.name}>
              <AvatarImage person={user} className="topbar-avatar-img" />
            </Link>
          </div>
        </header>
        <AnnouncementBanner />
        <VerifyEmailBanner />
        <main id="main" className="app-main" tabIndex="-1">
          {children}
        </main>
      </div>
      <nav
        className="bottom-nav"
        aria-label={L("التنقل السريع", "Quick navigation")}
      >
        <NavLink to="/home">
          <LayoutDashboard size={20} />
          <span>{t.home}</span>
        </NavLink>
        <NavLink to="/feed">
          <MessageCircle size={20} />
          <span>{t.feed}</span>
        </NavLink>
        <NavLink to="/communities">
          <Users size={20} />
          <span>{t.communities}</span>
        </NavLink>
        <NavLink to="/notifications">
          <Bell size={20} />
          <span>{t.notifications}</span>
        </NavLink>
      </nav>
    </div>
  );
}
function Protected({ children }) {
  const { user, ready } = useApp(),
    location = useLocation();
  const [t, L] = useText();
  if (!ready) return <div className="auth-loading">{t.loading}</div>;
  if (!user)
    return (
      <Auth
        prompt={L(
          "سجّل الدخول للمتابعة إلى هذه المساحة.",
          "Sign in to continue to this space.",
        )}
        redirect={location.pathname + location.search}
      />
    );
  return <AppShell>{children}</AppShell>;
}
function Auth({ mode = "login", prompt, redirect }) {
  const { user, setUser, setToast } = useApp();
  const [t, L] = useText();
  const [form, setForm] = useState({
      name: "",
      email: "",
      password: "",
      persona: "launchpad",
      location: "",
      mfaCode: "",
    }),
    [error, setError] = useState(""),
    [needMfa, setNeedMfa] = useState(false),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate(),
    location = useLocation();
  const signup = mode === "signup";
  useEffect(() => {
    if (user) navigate("/home", { replace: true });
  }, [user]);
  // Google sign-in is offered only when the server has it configured.
  const providers = useData("/auth/providers", 0, !PREVIEW_MODE).data;
  const oauthError = new URLSearchParams(location.search).get("error");
  useEffect(() => {
    if (!oauthError) return;
    setError(
      {
        google_cancelled: L("أُلغي تسجيل الدخول عبر Google", "Google sign-in was cancelled"),
        google_email_unverified: L("بريد Google غير موثّق", "Your Google email is not verified"),
        mfa_password_login_required: L(
          "حسابك محمي بالتحقق بخطوتين؛ سجّل الدخول بكلمة المرور والرمز.",
          "Your account uses two-factor; sign in with your password and code.",
        ),
        account_suspended: L("الحساب موقوف", "This account is suspended"),
        account_deleted: L("الحساب محذوف", "This account was deleted"),
        registration_unavailable: L("إنشاء الحسابات متوقف مؤقتًا", "Registration is temporarily unavailable"),
      }[oauthError] || L("تعذّر تسجيل الدخول عبر Google", "Google sign-in failed"),
    );
  }, [oauthError]);
  const googleHref = `/api/v1/auth/google/start?next=${encodeURIComponent(
    redirect || location.state?.from || "/home",
  )}`;
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const endpoint = PREVIEW_MODE
        ? "/auth/local"
        : signup
          ? "/auth/signup"
          : "/auth/login";
      const result = await api(endpoint, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setUser(result.user);
      setToast(
        signup || PREVIEW_MODE
          ? L("مرحبًا بك في USAM Communities", "Welcome to USAM Communities")
          : L("أهلًا بعودتك", "Welcome back"),
      );
      navigate(redirect || location.state?.from || "/home", { replace: true });
    } catch (e) {
      if (e.message === "mfa_required") setNeedMfa(true);
      setError(
        {
          mfa_required: L(
            "أدخل رمز التحقق من تطبيق المصادقة (أو رمز استرداد).",
            "Enter the code from your authenticator app (or a recovery code).",
          ),
          invalid_mfa_code: L(
            "رمز التحقق غير صحيح أو مستخدم من قبل",
            "That code is wrong or was already used",
          ),
          invalid_credentials: L(
            "بيانات الدخول غير صحيحة",
            "Incorrect email or password",
          ),
          account_suspended: L("هذا الحساب موقوف", "This account is suspended"),
          account_deleted: L("هذا الحساب محذوف", "This account was deleted"),
          account_locked: L(
            "محاولات كثيرة؛ حاول بعد ١٥ دقيقة",
            "Too many attempts; try again in 15 minutes",
          ),
          email_taken: L(
            "البريد الإلكتروني مستخدم بالفعل",
            "This email is already in use",
          ),
          invalid_signup: L(
            "راجع البيانات؛ كلمة المرور ١٠ أحرف على الأقل",
            "Check your details; password needs at least 10 characters",
          ),
          registration_unavailable: L(
            "إنشاء الحسابات متوقف مؤقتًا",
            "Registration is temporarily unavailable",
          ),
        }[e.message] || t.error,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-top">
          <Brand />
          <Link to="/" className="text-link">
            {L("العودة للرئيسية", "Back home")}
            <ArrowUpLeft size={16} />
          </Link>
        </div>
        <div className="auth-form">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            USAM COMMUNITIES
          </span>
          <h1>
            {PREVIEW_MODE
              ? L("ابدأ مساحتك المهنية.", "Start your professional space.")
              : signup
                ? L("ابدأ من هنا.", "Start here.")
                : L("أهلًا بعودتك.", "Welcome back.")}
          </h1>
          <p>
            {prompt ||
              L(
                "ملف واحد، وأربع مساحات تفتح لك أبوابًا جديدة.",
                "One profile. Four spaces for what comes next.",
              )}
          </p>
          <form onSubmit={submit}>
            {(signup || PREVIEW_MODE) && (
              <label>
                {L("الاسم الكامل", "Full name")}
                <input
                  required
                  minLength="2"
                  maxLength="100"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={L("اسمك الكامل", "Your full name")}
                />
              </label>
            )}
            {!PREVIEW_MODE && (
              <>
                <label>
                  {L("البريد الإلكتروني", "Email address")}
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    dir="ltr"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  {L("كلمة المرور", "Password")}
                  <input
                    required
                    type="password"
                    minLength={signup ? 10 : 1}
                    autoComplete={signup ? "new-password" : "current-password"}
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder={
                      signup
                        ? L("١٠ أحرف على الأقل", "At least 10 characters")
                        : "••••••••••"
                    }
                  />
                </label>
                {needMfa && !signup && (
                  <label>
                    {L("رمز التحقق بخطوتين", "Two-factor code")}
                    <input
                      required
                      autoFocus
                      dir="ltr"
                      inputMode="text"
                      autoComplete="one-time-code"
                      maxLength="32"
                      value={form.mfaCode}
                      onChange={(e) =>
                        setForm({ ...form, mfaCode: e.target.value })
                      }
                      placeholder="123456"
                    />
                  </label>
                )}
              </>
            )}
            {(signup || PREVIEW_MODE) && (
              <>
                <label>
                  {L("أقرب مجال لك", "Your starting space")}
                  <select
                    value={form.persona}
                    onChange={(e) =>
                      setForm({ ...form, persona: e.target.value })
                    }
                  >
                    {personaData.map((x) => (
                      <option key={x.slug} value={x.slug}>
                        {x.name} — {L(x.ar, x.en)}
                      </option>
                    ))}
                  </select>
                </label>
                {PREVIEW_MODE && (
                  <label>
                    {L("المدينة أو الدولة", "City or country")}
                    <input
                      maxLength="100"
                      value={form.location}
                      onChange={(e) =>
                        setForm({ ...form, location: e.target.value })
                      }
                      placeholder={L("مثال: القاهرة", "Example: Cairo")}
                    />
                  </label>
                )}
              </>
            )}
            {error && (
              <div className="form-error" role="alert">
                <AlertCircle size={17} />
                {error}
              </div>
            )}
            <button
              className="button button-accent auth-submit"
              disabled={busy}
            >
              {busy
                ? t.loading
                : PREVIEW_MODE
                  ? L("أنشئ مساحتي", "Create my space")
                  : signup
                    ? t.signup
                    : t.login}
              <ArrowUpLeft size={18} />
            </button>
          </form>
          {!PREVIEW_MODE && providers?.google && (
            <>
              <div className="auth-divider">
                <span>{L("أو", "or")}</span>
              </div>
              {/* A plain link: the server answers with a redirect to Google. */}
              <a className="button button-outline auth-google" href={googleHref}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
                {L("المتابعة باستخدام Google", "Continue with Google")}
              </a>
            </>
          )}
          {!PREVIEW_MODE && !signup && (
            <div className="auth-switch">
              <Link to="/forgot-password">
                {L("نسيت كلمة المرور؟", "Forgot your password?")}
              </Link>
            </div>
          )}
          {!PREVIEW_MODE && (
            <div className="auth-switch">
              {signup
                ? L("عندك حساب بالفعل؟", "Already have an account?")
                : L("جديد هنا؟", "New here?")}{" "}
              <Link to={signup ? "/login" : "/signup"}>
                {signup ? t.login : t.signup}
              </Link>
            </div>
          )}
          <p className="auth-legal">
            {PREVIEW_MODE
              ? L(
                  "تُحفظ هذه المساحة على جهازك الحالي. يمكنك تصفح المحتوى والمشاركة والتسجيل في الفعاليات مباشرة.",
                  "This space is saved on your current device. You can browse, post and register for events immediately.",
                )
              : L(
                  "باستخدام المنصة، توافق على قواعد المجتمع وسياسة الخصوصية.",
                  "By using the platform, you agree to its community guidelines and privacy policy.",
                )}
          </p>
        </div>
      </div>
      <div className="auth-art">
        <div className="auth-art-ring" />
        <div className="auth-art-content">
          <span>✳</span>
          <h2>
            {L(
              "مساحة للأفكار التي لا تنمو وحدها.",
              "Good ideas grow together.",
            )}
          </h2>
          <p>
            {L(
              "أشخاص، معرفة، وفرص في مكان واحد.",
              "People, knowledge and opportunity in one place.",
            )}
          </p>
          <div className="auth-art-names">
            LaunchPad <i /> FreelanceSpace <i /> HR Connect <i /> StudentZone
          </div>
        </div>
      </div>
    </div>
  );
}
function AppHeading({ eyebrow, title, description, action }) {
  return (
    <div className="app-heading">
      <div>
        <span className="eyebrow">
          <span className="eyebrow-line" />
          {eyebrow}
        </span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
function Dashboard() {
  const { user, lang } = useApp();
  const [t, L] = useText();
  const persona =
    personaData.find((x) => x.slug === user.persona) || personaData[0];
  const { data: posts, loading, error } = useData("/posts");
  const { data: events } = useData("/events");
  const { data: summary } = useData("/me/summary");
  const guide = {
    launchpad: "idea-to-first-interview",
    freelancespace: "portfolio-proof",
    hrconnect: "role-scorecard",
    studentzone: "learning-sprint",
  }[persona.slug];
  const steps = [
    {
      done: !!summary?.profileDone,
      title: L("قدّم نفسك ومهاراتك", "Introduce your skills"),
      href: "/settings",
    },
    {
      done: !!summary?.joinedCount,
      title: L("انضم لمساحة تشبهك", "Join a community"),
      href: `/communities/${persona.slug}`,
    },
    {
      done: !!summary?.postCount,
      title: L("ابدأ نقاشًا مهنيًا", "Start a conversation"),
      href: `/feed?community=${persona.slug}`,
    },
  ];
  return (
    <>
      <div className="welcome-strip">
        <span>
          {L("مساحتك اليوم", "YOUR SPACE TODAY")} ·{" "}
          {new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        </span>
        <span>✳ USAM COMMUNITIES</span>
      </div>
      <AppHeading
        eyebrow={L("صباح الفرص", "YOUR NEXT MOVE")}
        title={
          <>
            {L("أهلًا،", "Hello,")} <em>{user.name.split(" ")[0]}</em>
            <span className="heading-period">.</span>
          </>
        }
        description={L(
          "ابدأ من مجتمعك، تابع المحادثات، واكتشف خطوة مهنية جديدة.",
          "Start in your community, follow the conversation and find a new professional step.",
        )}
      />
      <section className="onboarding-panel">
        <div className="onboarding-top">
          <div>
            <span className="eyebrow">{L("بدايتك هنا", "GET STARTED")}</span>
            <h2>
              {L(
                "ثلاث خطوات تبني حضورك.",
                "Three steps to build your presence.",
              )}
            </h2>
          </div>
          <span className="onboarding-progress">
            {steps.filter((x) => x.done).length} / 3
          </span>
        </div>
        <div className="onboarding-steps">
          {steps.map((x, i) => (
            <Link to={x.href} key={x.href} className={x.done ? "done" : ""}>
              <span>
                {x.done ? <Check size={18} /> : String(i + 1).padStart(2, "0")}
              </span>
              <strong>{x.title}</strong>
              <ArrowUpLeft size={16} />
            </Link>
          ))}
        </div>
        <Link to={`/resources/${guide}`} className="onboarding-guide">
          <BookOpen size={20} />
          <span>
            {L("دليل عملي لمسارك", "A practical guide for your path")} ·{" "}
            {persona.name}
          </span>
          <ArrowUpLeft size={16} />
        </Link>
      </section>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <Link
            to={`/communities/${persona.slug}`}
            className={`dashboard-persona ${persona.color}`}
          >
            <div>
              <span className="eyebrow">
                {L("مساحتك الأساسية", "YOUR STARTING SPACE")}
              </span>
              <h2>{persona.name}</h2>
              <p>{L(persona.descAr, persona.descEn)}</p>
              <span className="button button-dark">
                {L("افتح المجتمع", "Open community")}
                <ArrowUpLeft size={17} />
              </span>
            </div>
            <persona.icon size={88} strokeWidth={0.8} />
          </Link>
          <div className="feed-toolbar">
            <div>
              <span className="eyebrow">
                {L("على الشبكة", "ON THE NETWORK")}
              </span>
              <h2>{L("أحدث المحادثات", "Latest conversations")}</h2>
            </div>
            <Link to="/feed" className="text-link">
              {t.viewAll}
              <ArrowUpLeft size={16} />
            </Link>
          </div>
          <Loadable loading={loading} error={error}>
            {posts?.items?.length ? (
              <PostList posts={posts.items.slice(0, 3)} />
            ) : (
              <Empty
                icon={MessageCircle}
                title={L(
                  "ابدأ محادثة تفتح بابًا",
                  "Start a conversation that opens a door",
                )}
                body={L(
                  "بعد انضمامك لأحد المجتمعات، شارك أول منشور لك.",
                  "Join a community and share your first post.",
                )}
                action={t.communities}
                href="/communities"
              />
            )}
          </Loadable>
        </div>
        <aside className="dashboard-aside">
          <div className="mini-panel next-step">
            <span className="eyebrow">{L("خطوتك التالية", "NEXT STEP")}</span>
            <span className="mini-panel-symbol">✳</span>
            <h3>{L("كبر شبكتك المهنية.", "Grow your professional circle.")}</h3>
            <p>
              {L(
                "اكتشف الأعضاء الذين اختاروا إظهار ملفاتهم وتواصل داخل المجتمع.",
                "Discover members who chose to make their profiles visible.",
              )}
            </p>
            <Link to="/members" className="text-link">
              {t.members}
              <ArrowUpLeft size={16} />
            </Link>
          </div>
          <div className="mini-panel">
            <div className="mini-panel-header">
              <span className="eyebrow">{L("القادم", "COMING UP")}</span>
              <CalendarDays size={19} />
            </div>
            <h3>{t.events}</h3>
            {events?.items?.length ? (
              events.items.slice(0, 2).map((e) => (
                <Link className="tiny-event" to={`/events/${e.id}`} key={e.id}>
                  {e.title}
                  <small>{new Date(e.startsAt).toLocaleDateString()}</small>
                </Link>
              ))
            ) : (
              <p>
                {L(
                  "عندما تنشر الإدارة فعالية، ستظهر هنا.",
                  "Published events will appear here.",
                )}
              </p>
            )}
            <Link to="/events" className="text-link">
              {t.viewAll}
              <ArrowUpLeft size={16} />
            </Link>
          </div>
          <div className="mini-panel switch-panel">
            <span className="eyebrow">
              {L("استكشف المزيد", "EXPLORE MORE")}
            </span>
            {personaData
              .filter((x) => x.slug !== persona.slug)
              .map((x) => (
                <Link to={`/communities/${x.slug}`} key={x.slug}>
                  <x.icon size={18} />
                  {x.name}
                  <ArrowUpLeft size={15} />
                </Link>
              ))}
          </div>
        </aside>
      </div>
    </>
  );
}
// Images attached to a post. Width/height come from the server so the layout
// does not jump while images load.
function PostImages({ images }) {
  if (!images?.length) return null;
  return (
    <div className={`post-images count-${Math.min(images.length, 4)}`}>
      {images.map((img) => (
        <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer">
          <img
            src={img.url}
            alt={img.alt || ""}
            width={img.width || undefined}
            height={img.height || undefined}
            loading="lazy"
            decoding="async"
          />
        </a>
      ))}
    </div>
  );
}
function PostList({ posts, onChange }) {
  const { user, setToast } = useApp();
  const [t, L] = useText();
  async function toggle(p, type) {
    if (!user) return location.assign("/login");
    try {
      await api(`/posts/${p.id}/${type}`, {
        method: (type === "reaction" ? p.liked : p.saved) ? "DELETE" : "PUT",
      });
      onChange?.();
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="post-list">
      {posts.map((p) => (
        <article className="post-card" key={p.id}>
          <div className="post-top">
            <Link to={`/members/${p.author?.username}`} className="avatar">
              {p.author?.name?.charAt(0) || "U"}
            </Link>
            <div>
              <Link
                to={`/members/${p.author?.username}`}
                className="post-author"
              >
                {p.author?.name}
              </Link>
              <div className="post-meta">
                {p.community?.nameEn} <span>·</span>{" "}
                {new Date(p.createdAt).toLocaleDateString()}
              </div>
            </div>
            {p.own && (
              <button
                className="icon-btn post-more"
                aria-label={L("حذف المنشور", "Delete post")}
                onClick={async () => {
                  if (window.confirm(L("حذف المنشور؟", "Delete this post?"))) {
                    await api(`/posts/${p.id}`, { method: "DELETE" });
                    onChange?.();
                  }
                }}
              >
                <X size={17} />
              </button>
            )}
          </div>
          <Link to={`/posts/${p.id}`} className="post-body">
            {p.body}
          </Link>
          <PostImages images={p.images} />
          <div className="post-actions">
            <button
              onClick={() => toggle(p, "reaction")}
              className={p.liked ? "selected" : ""}
            >
              <Heart size={17} fill={p.liked ? "currentColor" : "none"} />
              {p.reactionsCount}
            </button>
            <Link to={`/posts/${p.id}`}>
              <MessageCircle size={17} />
              {p.commentsCount}
            </Link>
            <button
              onClick={() => toggle(p, "bookmark")}
              className={p.saved ? "selected" : ""}
            >
              <Bookmark size={17} fill={p.saved ? "currentColor" : "none"} />
              {t.saved}
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  location.origin +
                    (PREVIEW_MODE ? "/#/" : "/") +
                    `posts/${p.id}`,
                );
                setToast(L("تم نسخ الرابط", "Link copied"));
              }}
            >
              <Share2 size={17} />
              {L("مشاركة", "Share")}
            </button>
            {user && !p.own && (
              <button
                aria-label={L("إبلاغ عن المنشور", "Report post")}
                onClick={async () => {
                  const reason = window.prompt(
                    L(
                      "سبب الإبلاغ (٨ أحرف على الأقل)",
                      "Reason for report (at least 8 characters)",
                    ),
                  );
                  if (!reason) return;
                  try {
                    await api("/reports", {
                      method: "POST",
                      body: JSON.stringify({ postId: p.id, reason }),
                    });
                    setToast(
                      L("وصل البلاغ للمراجعة", "Report submitted for review"),
                    );
                  } catch (e) {
                    setToast(e.message);
                  }
                }}
              >
                <Flag size={16} />
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
function Feed({ savedOnly = false }) {
  const { user, setToast } = useApp();
  const [t, L] = useText();
  const params = new URLSearchParams(useLocation().search);
  const [community, setCommunity] = useState(params.get("community") || ""),
    [mode, setMode] = useState("all"),
    [body, setBody] = useState(""),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(20);
  const [older, setOlder] = useState([]),
    [olderCursor, setOlderCursor] = useState(null);
  useEffect(() => {
    setLimit(20);
    setOlder([]);
    setOlderCursor(null);
  }, [community, mode]);
  // Up to 100 posts: widen the live window. Beyond that: append older pages
  // through the `before` cursor.
  async function showMore() {
    if (limit < 100 && !older.length) return setLimit((x) => Math.min(100, x + 20));
    const last = (older.length ? older : data.items).at(-1);
    try {
      const p = await api(
        `/posts?${community ? "community=" + community + "&" : ""}${mode === "following" ? "mode=following&" : ""}limit=20&before=${encodeURIComponent(last.createdAt)}`,
      );
      setOlder((x) => [...x, ...p.items]);
      setOlderCursor(p.hasMore ? p.nextBefore : null);
    } catch (e) {
      setToast(e.message);
    }
  }
  // "Show more" grows the window instead of stitching pages, so a refresh
  // after a reaction/comment keeps every visible post consistent.
  const { data, loading, error } = useData(
    savedOnly
      ? "/saved"
      : `/posts?${community ? "community=" + community + "&" : ""}${mode === "following" ? "mode=following&" : ""}limit=${limit}`,
    refresh,
  );
  const [joined, setJoined] = useState(null);
  useEffect(() => {
    if (user && community)
      api(`/communities/${community}`)
        .then((x) => setJoined(x.joined))
        .catch(() => setJoined(false));
    else setJoined(null);
  }, [community, user, refresh]);
  // Images are uploaded as soon as they are picked, then referenced by id
  // when the post is published (unused uploads are cleaned up server-side).
  const [images, setImages] = useState([]),
    [uploading, setUploading] = useState(false);
  async function pickImages(e) {
    const files = [...(e.target.files || [])].slice(0, 4 - images.length);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) throw new Error("unsupported_file_type");
        const dataUrl = await resizeToDataUrl(file, 1600);
        const r = await api("/media/images", {
          method: "POST",
          body: JSON.stringify({ image: dataUrl }),
        });
        setImages((x) => [...x, r]);
      }
    } catch (err) {
      setToast(
        {
          unsupported_file_type: L("نوع الملف غير مدعوم", "Unsupported file type"),
          file_too_large: L("الصورة كبيرة جدًا", "Image is too large"),
          invalid_image: L("تعذّر قراءة الصورة", "Could not read the image"),
          upload_limit_reached: L("وصلت للحد اليومي للرفع", "Daily upload limit reached"),
        }[err.message] || err.message,
      );
    } finally {
      setUploading(false);
    }
  }
  async function removeImage(img) {
    setImages((x) => x.filter((i) => i.id !== img.id));
    api(`/media/images/${img.id}`, { method: "DELETE" }).catch(() => {});
  }
  async function publish(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/posts", {
        method: "POST",
        body: JSON.stringify({ body, community, imageIds: images.map((i) => i.id) }),
      });
      setBody("");
      setImages([]);
      setRefresh((x) => x + 1);
      setToast(L("تم نشر منشورك", "Your post is published"));
    } catch (e) {
      setToast(
        e.message === "join_community_first"
          ? L("انضم للمجتمع أولًا", "Join the community first")
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow={
          savedOnly
            ? L("احتفظ بما يهمك", "KEEP WHAT MATTERS")
            : L("المحادثة المستمرة", "THE CONVERSATION")
        }
        title={savedOnly ? t.saved : t.feed}
        description={
          savedOnly
            ? L(
                "المنشورات التي حفظتها في مكان واحد.",
                "Posts you saved, all in one place.",
              )
            : L(
                "مساحة للأسئلة والأفكار والخبرة التي يمكن مشاركتها.",
                "A space for questions, ideas and experience worth sharing.",
              )
        }
      />
      <div className="feed-layout">
        <div className="feed-main">
          {!savedOnly && (
            <>
              <div className="feed-filters">
                <button
                  className={!community && mode === "all" ? "active" : ""}
                  onClick={() => {
                    setCommunity("");
                    setMode("all");
                  }}
                >
                  {L("الكل", "All")}
                </button>
                {user && (
                  <button
                    className={mode === "following" ? "active" : ""}
                    onClick={() => {
                      setCommunity("");
                      setMode("following");
                    }}
                  >
                    {L("أتابعهم", "Following")}
                  </button>
                )}
                {personaData.map((p) => (
                  <button
                    key={p.slug}
                    className={community === p.slug ? "active" : ""}
                    onClick={() => {
                      setCommunity(p.slug);
                      setMode("all");
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {user && community && joined && (
                <form className="compose" onSubmit={publish}>
                  <div className="compose-row">
                    <span className="avatar">{user.name.charAt(0)}</span>
                    <textarea
                      required
                      minLength="2"
                      maxLength="3000"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={L(
                        "ما الفكرة التي تحب مشاركتها؟",
                        "What would you like to share?",
                      )}
                    />
                  </div>
                  {images.length > 0 && (
                    <div className="compose-images">
                      {images.map((img) => (
                        <figure key={img.id}>
                          <img src={img.url} alt="" />
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={L("إزالة الصورة", "Remove image")}
                            onClick={() => removeImage(img)}
                          >
                            <X size={14} />
                          </button>
                        </figure>
                      ))}
                    </div>
                  )}
                  <div className="compose-bottom">
                    <span>{body.length}/3000</span>
                    <label
                      className={`button button-outline compose-attach ${images.length >= 4 || uploading ? "disabled" : ""}`}
                    >
                      <Plus size={15} />
                      {uploading
                        ? t.loading
                        : L(`صور (${images.length}/4)`, `Images (${images.length}/4)`)}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        hidden
                        disabled={images.length >= 4 || uploading}
                        onChange={pickImages}
                        aria-label={L("أضف صورًا", "Add images")}
                      />
                    </label>
                    <button
                      className="button button-accent"
                      disabled={busy || uploading || body.trim().length < 2}
                    >
                      {t.publish}
                      <Send size={16} />
                    </button>
                  </div>
                </form>
              )}
              {user && community && joined === false && (
                <div className="join-prompt">
                  <Info size={18} />
                  {L(
                    "انضم لهذا المجتمع لتتمكن من النشر.",
                    "Join this community to publish.",
                  )}{" "}
                  <Link to={`/communities/${community}`}>
                    {t.join}
                    <ArrowUpLeft size={15} />
                  </Link>
                </div>
              )}
            </>
          )}
          <Loadable loading={loading} error={error}>
            {data?.items?.length ? (
              <>
                <PostList
                  posts={[...data.items, ...older]}
                  onChange={() => setRefresh((x) => x + 1)}
                />
                {(older.length ? olderCursor : data.hasMore) && (
                  <button
                    type="button"
                    className="button button-outline load-older"
                    onClick={showMore}
                  >
                    {L("عرض منشورات أقدم", "Show older posts")}
                  </button>
                )}
              </>
            ) : (
              <Empty
                icon={MessageCircle}
                title={
                  savedOnly
                    ? L("لم تحفظ أي منشورات بعد", "No saved posts yet")
                    : L("لا توجد منشورات هنا بعد", "No posts here yet")
                }
                body={
                  savedOnly
                    ? L(
                        "يمكنك حفظ أي منشور لتعود إليه لاحقًا.",
                        "Save posts to revisit them later.",
                      )
                    : L(
                        "اختر مجتمعًا وانضم إليه لتبدأ المحادثة.",
                        "Choose a community and join to start the conversation.",
                      )
                }
                action={savedOnly ? t.feed : t.communities}
                href={savedOnly ? "/feed" : "/communities"}
              />
            )}
          </Loadable>
        </div>
        <aside className="feed-aside">
          <div className="mini-panel">
            <span className="eyebrow">
              {L("مجتمعاتك القادمة", "DISCOVER SPACES")}
            </span>
            <h3>
              {L("أربع زوايا، منظور أوسع.", "Four spaces. More perspectives.")}
            </h3>
            {personaData.map((p) => (
              <Link
                className="side-community"
                key={p.slug}
                to={`/communities/${p.slug}`}
              >
                <span className={`side-community-icon ${p.color}`}>
                  <p.icon size={17} />
                </span>
                {p.name}
                <ArrowUpLeft size={15} />
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
function PostDetail() {
  const { id } = useParams(),
    { user, setToast } = useApp();
  const [t, L] = useText();
  const [body, setBody] = useState(""),
    [refresh, setRefresh] = useState(0),
    [editing, setEditing] = useState(false),
    [editBody, setEditBody] = useState("");
  const { data, loading, error } = useData(`/posts/${id}`, refresh);
  async function comment(e) {
    e.preventDefault();
    try {
      await api(`/posts/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setBody("");
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(e.message);
    }
  }
  const p = data?.item;
  return (
    <>
      <AppHeading eyebrow={t.feed} title={L("المحادثة", "Conversation")} />
      <div className="narrow-content">
        <Loadable loading={loading} error={error}>
          {p ? (
            <>
              <PostList posts={[p]} onChange={() => setRefresh((x) => x + 1)} />
              {p.own && (
                <div className="post-edit-wrap">
                  {editing ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          await api(`/posts/${id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ body: editBody }),
                          });
                          setEditing(false);
                          setRefresh((x) => x + 1);
                          setToast(L("تم تعديل المنشور", "Post updated"));
                        } catch (e) {
                          setToast(e.message);
                        }
                      }}
                    >
                      <label>
                        {L("عدّل منشورك", "Edit your post")}
                        <textarea
                          required
                          minLength="2"
                          maxLength="3000"
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                        />
                      </label>
                      <div>
                        <button className="button button-accent">
                          {L("احفظ التعديل", "Save changes")}
                        </button>
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={() => setEditing(false)}
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="post-edit-trigger"
                      onClick={() => {
                        setEditBody(p.body);
                        setEditing(true);
                      }}
                    >
                      <PenLine size={16} />
                      {L("تعديل المنشور", "Edit post")}
                    </button>
                  )}
                </div>
              )}
              <div className="comments-panel">
                <h2>
                  {L("التعليقات", "Comments")}{" "}
                  <span>{p.comments?.length || 0}</span>
                </h2>
                {p.comments?.length ? (
                  p.comments.map((c) => (
                    <div className="comment" key={c.id}>
                      <span className="avatar">
                        {c.author?.name?.charAt(0)}
                      </span>
                      <div>
                        <strong>{c.author?.name}</strong>
                        <p>{c.body}</p>
                      </div>
                      {user &&
                        (user.id === c.author?.id ||
                          ["moderator", "admin", "super_admin"].includes(user.role)) && (
                          <button
                            className="icon-btn"
                            onClick={async () => {
                              await api(`/posts/${id}/comments/${c.id}`, {
                                method: "DELETE",
                              });
                              setRefresh((x) => x + 1);
                            }}
                            aria-label={L("حذف التعليق", "Delete comment")}
                          >
                            <X size={16} />
                          </button>
                        )}
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    {L("كن أول من يعلّق.", "Be the first to comment.")}
                  </p>
                )}
                {user ? (
                  <form className="comment-form" onSubmit={comment}>
                    <input
                      required
                      maxLength="800"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={L(
                        "اكتب تعليقًا محترمًا...",
                        "Write a thoughtful comment...",
                      )}
                    />
                    <button className="button button-accent">
                      {L("إرسال", "Send")}
                      <Send size={16} />
                    </button>
                  </form>
                ) : (
                  <Link to="/login" className="text-link">
                    {t.login}
                    <ArrowUpLeft size={16} />
                  </Link>
                )}
              </div>
            </>
          ) : (
            <Empty title={L("المنشور غير متاح", "Post unavailable")} />
          )}
        </Loadable>
      </div>
    </>
  );
}
function Directory({ kind }) {
  const [t, L] = useText();
  const { user, setToast, lang } = useApp();
  const [refresh, setRefresh] = useState(0);
  // Members directory: server-side search, persona filter and paging.
  const [memberQ, setMemberQ] = useState(""),
    [memberFilter, setMemberFilter] = useState({ q: "", persona: "", page: 1 });
  const memberUrl = `/members?${new URLSearchParams({
    ...(memberFilter.q ? { q: memberFilter.q } : {}),
    ...(memberFilter.persona ? { persona: memberFilter.persona } : {}),
    page: String(memberFilter.page),
  })}`;
  const endpoints = {
    events: "/events",
    offers: "/offers",
    members: memberUrl,
    organizations: "/organizations",
    mentors: "/mentors",
  };
  const { data, loading, error } = useData(endpoints[kind], refresh);
  const meta = {
    events: [
      CalendarDays,
      t.events,
      L(
        "لقاءات تحول المعرفة إلى علاقات",
        "Meetings that turn knowledge into connections",
      ),
      L(
        "الفعاليات المنشورة تظهر هنا مع مكانها وموعدها وإمكانية التسجيل المجاني.",
        "Published events appear here with time, place and free registration.",
      ),
    ],
    offers: [
      Gift,
      t.offers,
      L("مزايا من شركاء موثوقين", "Perks from reviewed partners"),
      L(
        "المزايا الفعلية تظهر بعد اعتماد الجهة المصدرة ونشر العرض.",
        "Actual perks appear when an issuer has been reviewed and an offer published.",
      ),
    ],
    members: [
      Users,
      t.members,
      L(
        "اكتشف من يحب أن يكون مرئيًا",
        "Discover people who chose to be visible",
      ),
      L(
        "الملفات الظاهرة هنا لأعضاء وافقوا على الظهور في الدليل.",
        "Only members who opted into discovery are visible here.",
      ),
    ],
    organizations: [
      Building2,
      t.organizations,
      L("مؤسسات داخل الشبكة", "Organizations in the network"),
      L(
        "المؤسسات المعروضة خضعت لمراجعة إدارة المنصة.",
        "Listed organizations have been reviewed by platform admins.",
      ),
    ],
    mentors: [
      Lightbulb,
      t.mentors,
      L("خبرات تفتح زاوية جديدة", "Expertise that opens a new perspective"),
      L(
        "يمكنك طلب جلسة من المرشدين الذين نشروا ملفاتهم.",
        "Request a session from mentors who have published profiles.",
      ),
    ],
  }[kind];
  const Icon = meta[0];
  async function register(e) {
    if (!user) {
      location.assign("/login");
      return;
    }
    try {
      const result = await api(`/events/${e.id}/register`, { method: "POST" });
      setToast(
        result.status === "registered"
          ? L("تم تسجيلك في الفعالية", "You’re registered")
          : L("أُضيف اسمك لقائمة الانتظار", "You’re on the waitlist"),
      );
      setRefresh((x) => x + 1);
    } catch (err) {
      setToast(err.message);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow="USAM COMMUNITIES"
        title={meta[1]}
        description={meta[2]}
      />
      <div className="directory-intro">
        <Icon size={25} />
        <p>{meta[3]}</p>
      </div>
      {kind === "members" && (
        <form
          className="search-form directory-search"
          onSubmit={(e) => {
            e.preventDefault();
            setMemberFilter((f) => ({ ...f, q: memberQ.trim(), page: 1 }));
          }}
        >
          <Search size={20} />
          <input
            value={memberQ}
            onChange={(e) => setMemberQ(e.target.value)}
            maxLength="80"
            aria-label={L("ابحث في الأعضاء", "Search members")}
            placeholder={L("اسم، مدينة، أو مهارة...", "Name, city or skill...")}
          />
          <select
            aria-label={L("المجتمع", "Community")}
            value={memberFilter.persona}
            onChange={(e) =>
              setMemberFilter((f) => ({ ...f, persona: e.target.value, page: 1 }))
            }
          >
            <option value="">{L("كل المجتمعات", "All communities")}</option>
            {personaData.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="button button-accent">{t.search}</button>
        </form>
      )}
      <Loadable loading={loading} error={error}>
        {data?.items?.length ? (
          <div className="directory-grid">
            {data.items.map((item) => (
              <article className="directory-card" key={item.id}>
                <div className="directory-card-top">
                  <span className="directory-icon">
                    <Icon size={22} />
                  </span>
                  <span className="directory-index">
                    USAM / {kind.toUpperCase()}
                  </span>
                </div>
                <h2>
                  {kind === "members"
                    ? item.name
                    : kind === "mentors"
                      ? item.User?.name
                      : kind === "organizations"
                        ? item.name
                        : item.title}
                </h2>
                <p>
                  {kind === "members"
                    ? item.bio ||
                      L("عضو في USAM Communities", "USAM Communities member")
                    : kind === "mentors"
                      ? item.expertise
                      : kind === "events"
                        ? item.description
                        : kind === "organizations"
                          ? item.description
                          : item.description}
                </p>
                <div className="directory-meta">
                  {kind === "events" ? (
                    <>
                      <span>
                        <CalendarDays size={15} />
                        {new Date(item.startsAt).toLocaleString()}
                      </span>
                      <span>
                        <MapPin size={15} />
                        {item.venue ||
                          L("المكان يحدد لاحقًا", "Venue to be confirmed")}
                      </span>
                    </>
                  ) : kind === "members" ? (
                    <span>
                      <MapPin size={15} />
                      {item.location ||
                        L("لم يحدد الموقع", "Location not listed")}
                    </span>
                  ) : kind === "mentors" ? (
                    <span>{item.availability}</span>
                  ) : kind === "offers" ? (
                    <span>{item.terms}</span>
                  ) : (
                    <span>{item.sector}</span>
                  )}
                </div>
                {kind === "events" ? (
                  <div className="card-actions">
                    <Link to={`/events/${item.id}`} className="text-link">
                      {t.learnMore}
                      <ArrowUpLeft size={15} />
                    </Link>
                    {item.priceType === "paid" ? (
                      <Link
                        className="button button-accent small-button"
                        to={`/events/${item.id}`}
                      >
                        {L("تذكرة", "Ticket")} · {formatEgp(item.priceEgp, lang)}
                      </Link>
                    ) : item.myRegistration &&
                      item.myRegistration.status !== "cancelled" ? (
                      <span className="status-pill active">
                        {item.myRegistration.status === "waitlisted"
                          ? L("قائمة الانتظار", "Waitlisted")
                          : L("مسجّل", "Registered")}
                      </span>
                    ) : (
                      <button
                        className="button button-accent small-button"
                        onClick={() => register(item)}
                      >
                        {L("سجّل مجانًا", "Register free")}
                      </button>
                    )}
                  </div>
                ) : kind === "members" ? (
                  <Link className="text-link" to={`/members/${item.username}`}>
                    {L("عرض الملف", "View profile")}
                    <ArrowUpLeft size={16} />
                  </Link>
                ) : kind === "offers" ? (
                  <button
                    className="text-link button-reset"
                    onClick={async () => {
                      if (!user) return location.assign("/login");
                      try {
                        const x = await api(`/offers/${item.id}/claim`, {
                          method: "POST",
                        });
                        setToast(
                          x.code
                            ? `${L("كود الميزة", "Perk code")}: ${x.code}`
                            : `${L("رقم المطالبة", "Claim ID")}: ${x.claimId}`,
                        );
                      } catch (e) {
                        setToast(e.message);
                      }
                    }}
                  >
                    {L("اطلب الميزة", "Claim perk")}
                    <ArrowUpLeft size={16} />
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={Icon}
            title={L("لا توجد عناصر منشورة بعد", "Nothing published yet")}
            body={
              kind === "organizations"
                ? L(
                    "هل تمثل مؤسسة؟ قدّم طلب إضافة وسيراجعه فريق المنصة.",
                    "Represent an organization? Submit it for review.",
                  )
                : L(
                    "ستظهر العناصر هنا فور نشرها بعد المراجعة.",
                    "Items will appear here after they are reviewed and published.",
                  )
            }
            action={
              kind === "organizations" && user
                ? L("أضف مؤسستك", "Add your organization")
                : undefined
            }
            href={kind === "organizations" ? "/organization/new" : undefined}
          />
        )}
      </Loadable>
    </>
  );
}
function EventDetail() {
  const { id } = useParams();
  const { user, setToast, lang } = useApp();
  const [t, L] = useText();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData(`/events/${id}`, refresh);
  const e = data?.item;
  const mine = e?.myRegistration;
  const own = mine && !["cancelled", "expired"].includes(mine.status) ? mine : null;
  const paid = e?.priceType === "paid";
  const [busy, setBusy] = useState(false);
  const [couponInput, setCouponInput] = useState(""),
    [coupon, setCoupon] = useState(null),
    [couponError, setCouponError] = useState(""),
    [checkingCoupon, setCheckingCoupon] = useState(false);
  async function applyCoupon(ev) {
    ev.preventDefault();
    if (!user) return location.assign("/login");
    setCheckingCoupon(true);
    setCouponError("");
    try {
      setCoupon(
        await api("/coupons/quote", {
          method: "POST",
          body: JSON.stringify({ code: couponInput.trim(), eventId: id }),
        }),
      );
    } catch (err) {
      setCoupon(null);
      setCouponError(couponErrorText(err.message, L));
    } finally {
      setCheckingCoupon(false);
    }
  }
  const errorText = (code) =>
    ({
      event_full: L("اكتملت المقاعد", "This event is sold out"),
      event_started: L("بدأت الفعالية بالفعل", "This event has already started"),
      paid_ticket_refund_required: L(
        "لإلغاء تذكرة مدفوعة تواصل معنا لطلب استرداد المبلغ.",
        "To cancel a paid ticket, contact us to request a refund.",
      ),
      payment_provider_activation_required: L(
        "الدفع الإلكتروني غير مفعّل حاليًا. لم يتم خصم أي مبلغ.",
        "Online payment is not active right now. Nothing was charged.",
      ),
      payment_initialization_failed: L(
        "تعذّر فتح صفحة الدفع، حاول مرة أخرى.",
        "Could not open the payment page, please try again.",
      ),
      email_verification_required: L("وثّق بريدك أولًا", "Verify your email first"),
    })[code] || code;
  async function action() {
    if (!user) return location.assign("/login");
    setBusy(true);
    try {
      const cancelling = own && !(paid && own.status === "pending_payment");
      const r = await api(`/events/${id}/register`, {
        method: cancelling ? "DELETE" : "POST",
        ...(!cancelling && coupon ? { body: JSON.stringify({ couponCode: coupon.code }) } : {}),
      });
      if (r.checkoutUrl) {
        // Paid ticket: the seat is held while the member pays on Paymob.
        window.location.assign(r.checkoutUrl);
        return;
      }
      setToast(
        r.status === "cancelled"
          ? L("تم إلغاء التسجيل", "Registration cancelled")
          : r.status === "waitlisted"
            ? L("أُضيف اسمك إلى قائمة الانتظار", "Added to the waitlist")
            : L("تم تسجيلك", "Registration confirmed"),
      );
      setRefresh((x) => x + 1);
    } catch (e) {
      if (e.message.startsWith("coupon_")) {
        setCoupon(null);
        setCouponError(couponErrorText(e.message, L));
      } else setToast(errorText(e.message));
    } finally {
      setBusy(false);
    }
  }
  async function releaseHold() {
    setBusy(true);
    try {
      await api(`/events/${id}/register`, { method: "DELETE" });
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(errorText(e.message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AppHeading eyebrow={t.events} title={e?.title || t.events} />
      <div className="narrow-content">
        <Loadable loading={loading} error={error}>
          {e ? (
            <div className="event-detail">
              <div className="event-date-card">
                <CalendarDays size={28} />
                <strong>
                  {new Date(e.startsAt).toLocaleDateString(
                    lang === "ar" ? "ar-EG" : "en-GB",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    },
                  )}
                </strong>
                <span>
                  {new Date(e.startsAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {e.timezone}
                </span>
              </div>
              <p>{e.description}</p>
              <div className="event-properties">
                <div>
                  <MapPin size={19} />
                  {e.venue || L("سيحدد المكان لاحقًا", "Venue to be confirmed")}
                </div>
                <div>
                  <Users size={19} />
                  {e.registeredCount || 0} / {e.capacity} {L("مقعد", "seats")}
                  {e.seatsLeft === 0 && ` · ${L("مكتملة", "sold out")}`}
                </div>
                <div>
                  {paid ? <CreditCard size={19} /> : <Gift size={19} />}
                  {paid
                    ? `${L("تذكرة", "Ticket")} · ${formatEgp(e.priceEgp, lang)}`
                    : L("تسجيل مجاني", "Free registration")}
                </div>
              </div>
              {e.status === "cancelled" && (
                <p className="billing-alert">
                  <Info size={18} />
                  {L(
                    "أُلغيت هذه الفعالية. تُسترد قيمة التذاكر المدفوعة تلقائيًا.",
                    "This event was cancelled. Paid tickets are refunded automatically.",
                  )}
                </p>
              )}
              {paid && !own && e.status === "published" && e.seatsLeft > 0 && (
                <CouponField
                  value={couponInput}
                  onChange={setCouponInput}
                  onApply={applyCoupon}
                  onRemove={() => {
                    setCoupon(null);
                    setCouponInput("");
                  }}
                  applied={coupon}
                  error={couponError}
                  busy={checkingCoupon}
                />
              )}
              {e.status !== "cancelled" && !(paid && own?.status === "registered") && (
                <button
                  className="button button-accent"
                  onClick={action}
                  disabled={busy || (!own && paid && e.seatsLeft === 0)}
                >
                  {busy
                    ? t.loading
                    : paid
                      ? own?.status === "pending_payment"
                        ? L("أكمل الدفع", "Complete payment")
                        : coupon && coupon.finalEgp === 0
                          ? L("احصل على تذكرتك بالكود", "Get my ticket with this code")
                          : `${L("اشترِ تذكرة", "Buy ticket")} · ${formatEgp(coupon ? coupon.finalEgp : e.priceEgp, lang)}`
                      : own
                        ? L("إلغاء تسجيلي", "Cancel registration")
                        : L("سجّل الآن", "Register now")}
                  <ArrowUpLeft size={18} />
                </button>
              )}
              {paid && own?.status === "pending_payment" && (
                <button className="button button-outline" onClick={releaseHold} disabled={busy}>
                  {L("إلغاء الحجز المؤقت", "Release my held seat")}
                </button>
              )}
              {own && (
                <p className="success-note">
                  <CheckCircle2 size={17} />
                  {own.status === "waitlisted"
                    ? L("أنت في قائمة الانتظار", "You are on the waitlist")
                    : own.status === "pending_payment"
                      ? L(
                          "مقعدك محجوز مؤقتًا حتى يكتمل الدفع.",
                          "Your seat is held until payment completes.",
                        )
                      : L("أنت مسجّل في الفعالية", "You are registered")}
                </p>
              )}
              {own?.status === "registered" && (
                <Link className="text-link" to="/my-events">
                  {L("عرض تذكرتي", "View my ticket")}
                  <ArrowUpLeft size={15} />
                </Link>
              )}
            </div>
          ) : (
            <Empty title={L("الفعالية غير متاحة", "Event unavailable")} />
          )}
        </Loadable>
      </div>
    </>
  );
}
function MemberProfile() {
  const { username } = useParams();
  const { user, setToast } = useApp();
  const navigate = useNavigate();
  const [t, L] = useText();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData(`/members/${username}`, refresh);
  const person = data?.item;
  if (user?.username === username) return <Profile />;
  return (
    <>
      <AppHeading eyebrow={t.members} title={person?.name || t.profile} />
      <Loadable loading={loading} error={error}>
        {person ? (
          <div className="profile-card">
            <AvatarImage person={person} />
            <h2>{person.name}</h2>
            <p>{person.bio}</p>
            <span>
              <MapPin size={16} />
              {person.location || L("لم يحدد الموقع", "Location not listed")}
            </span>
            <div className="skill-list">
              {person.skills?.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            {user && (
              <button
                className="button button-outline profile-action"
                onClick={async () => {
                  try {
                    await api(`/members/${person.id}/follow`, {
                      method: data.following ? "DELETE" : "PUT",
                    });
                    setRefresh((x) => x + 1);
                  } catch (e) {
                    setToast(e.message);
                  }
                }}
              >
                {data.following
                  ? L("إلغاء المتابعة", "Unfollow")
                  : L("تابع العضو", "Follow member")}
                <Users size={17} />
              </button>
            )}
            {user && data.mentor && (
              <button
                className="button button-accent profile-action"
                disabled={data.mentor.requested}
                onClick={async () => {
                  const message = window.prompt(
                    L(
                      "اكتب رسالة قصيرة لطلب الإرشاد",
                      "Write a short message for your mentorship request",
                    ),
                  );
                  if (!message || message.trim().length < 10) {
                    if (message !== null)
                      setToast(
                        L(
                          "الرسالة قصيرة جدًا (١٠ أحرف على الأقل)",
                          "Message too short (min 10 characters)",
                        ),
                      );
                    return;
                  }
                  try {
                    await api(`/mentors/${data.mentor.id}/request`, {
                      method: "POST",
                      body: JSON.stringify({ message: message.trim() }),
                    });
                    setRefresh((x) => x + 1);
                    setToast(
                      L("تم إرسال طلب الإرشاد", "Mentorship request sent"),
                    );
                  } catch (e) {
                    setToast(
                      e.message === "request_exists"
                        ? L("لديك طلب سابق بالفعل", "You already have a request")
                        : e.message,
                    );
                  }
                }}
              >
                {data.mentor.requested
                  ? L("تم إرسال الطلب", "Request sent")
                  : L("اطلب الإرشاد", "Request mentorship")}
                <GraduationCap size={17} />
              </button>
            )}
            {user && (
              <button
                className="button button-outline profile-action"
                onClick={async () => {
                  if (
                    !window.confirm(
                      L(
                        "حظر هذا العضو وإيقاف التواصل؟",
                        "Block this member and stop contact?",
                      ),
                    )
                  )
                    return;
                  try {
                    await api(`/members/${person.id}/block`, { method: "PUT" });
                    setToast(L("تم الحظر", "Member blocked"));
                    navigate("/members");
                  } catch (e) {
                    setToast(e.message);
                  }
                }}
              >
                {L("حظر العضو", "Block member")}
                <Shield size={17} />
              </button>
            )}
            {user && person.messagesEnabled && (
              <button
                className="button button-accent profile-action"
                onClick={async () => {
                  try {
                    const x = await api("/messages/start", {
                      method: "POST",
                      body: JSON.stringify({ username: person.username }),
                    });
                    navigate(`/messages/${x.id}`);
                  } catch (e) {
                    setToast(
                      e.message === "shared_community_required"
                        ? L(
                            "يجب أن تشتركا في مجتمع واحد",
                            "You need a shared community",
                          )
                        : e.message === "messaging_unavailable"
                          ? L(
                              "فعّل الرسائل في إعداداتك أولًا",
                              "Enable messages in settings first",
                            )
                          : e.message,
                    );
                  }
                }}
              >
                {L("أرسل رسالة", "Send a message")}
                <Mail size={17} />
              </button>
            )}
          </div>
        ) : (
          <Empty
            title={L("الملف غير ظاهر في الدليل", "This profile is not visible")}
            body={L(
              "قد يكون العضو اختار إخفاء ملفه.",
              "The member may have chosen to hide their profile.",
            )}
          />
        )}
      </Loadable>
    </>
  );
}
function Profile() {
  const { user } = useApp();
  const [t, L] = useText();
  const persona = personaData.find((p) => p.slug === user.persona);
  return (
    <>
      <AppHeading
        eyebrow={t.profile}
        title={user.name}
        description={L(
          "صورتك المهنية داخل المجتمع.",
          "Your professional presence in the community.",
        )}
        action={
          <Link to="/settings" className="button button-outline">
            {L("تعديل الملف", "Edit profile")}
            <PenLine size={16} />
          </Link>
        }
      />
      <div className="profile-card">
        <AvatarImage person={user} />
        <h2>{user.name}</h2>
        <span className="muted">@{user.username}</span>
        <p>
          {user.bio ||
            L(
              "أضف تعريفًا قصيرًا عنك من الإعدادات.",
              "Add a short bio from settings.",
            )}
        </p>
        <span>
          <MapPin size={16} />
          {user.location || L("أضف موقعك", "Add your location")}
        </span>
        <span>
          <Users size={16} />
          {persona?.name}
        </span>
        <div className="skill-list">
          {user.skills?.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <div className="profile-privacy">
          <LockKeyhole size={16} />
          {user.discoverable
            ? L(
                "ملفك ظاهر في دليل الأعضاء",
                "Your profile is visible in the member directory",
              )
            : L(
                "ملفك غير ظاهر في دليل الأعضاء",
                "Your profile is hidden from the member directory",
              )}
        </div>
      </div>
      {!PREVIEW_MODE && <MyConnectionsCard />}
    </>
  );
}
function SettingsPage() {
  const { user, setUser, setToast } = useApp();
  const [t, L] = useText();
  const [form, setForm] = useState({
      ...user,
      skillsText: (user.skills || []).join(", "),
    }),
    [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const x = await api("/me", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          skills: form.skillsText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      setUser(x.user);
      setToast(L("تم حفظ التغييرات", "Changes saved"));
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow={L("حسابك", "YOUR ACCOUNT")}
        title={t.settings}
        description={L(
          "تحكم في معلوماتك وظهور ملفك الشخصي.",
          "Control your information and profile visibility.",
        )}
      />
      <form className="settings-form" onSubmit={save}>
        <h2>{L("المعلومات الأساسية", "Basic information")}</h2>
        <div className="form-columns">
          <label>
            {L("الاسم", "Name")}
            <input
              value={form.name}
              required
              minLength="2"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            {L("الموقع", "Location")}
            <input
              value={form.location || ""}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </label>
        </div>
        <label>
          {L("نبذة عنك", "About you")}
          <textarea
            maxLength="400"
            value={form.bio || ""}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </label>
        <label>
          {L("المهارات (افصل بينها بفاصلة)", "Skills (comma separated)")}
          <input
            value={form.skillsText}
            onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
          />
        </label>
        <div className="form-columns">
          <label>
            {L("المساحة الأساسية", "Starting space")}
            <select
              value={form.persona}
              onChange={(e) => setForm({ ...form, persona: e.target.value })}
            >
              {personaData.map((p) => (
                <option value={p.slug} key={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {L("لغة الحساب", "Account language")}
            <select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={!!form.messagesEnabled}
            onChange={(e) =>
              setForm({ ...form, messagesEnabled: e.target.checked })
            }
          />
          <span>
            <strong>
              {L(
                "اسمح برسائل من أعضاء مجتمعاتك",
                "Allow messages from shared community members",
              )}
            </strong>
            <small>
              {L(
                "لا تبدأ محادثة إلا بموافقتك على استقبال الرسائل.",
                "Conversations require your opt in.",
              )}
            </small>
          </span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={!!form.discoverable}
            onChange={(e) =>
              setForm({ ...form, discoverable: e.target.checked })
            }
          />
          <span>
            <strong>
              {L(
                "ظهور الملف في دليل الأعضاء",
                "Show profile in member directory",
              )}
            </strong>
            <small>
              {L(
                "عند إيقافه لن يظهر ملفك في نتائج الأعضاء.",
                "Turn this off to hide your profile from member results.",
              )}
            </small>
          </span>
        </label>
        <button className="button button-accent" disabled={busy}>
          {busy ? t.loading : L("حفظ التغييرات", "Save changes")}
          <Check size={17} />
        </button>
      </form>
      {!PREVIEW_MODE && <AvatarCard />}
      {!PREVIEW_MODE && <EmailVerificationCard />}
      {!PREVIEW_MODE && <ChangePasswordCard />}
      {!PREVIEW_MODE && <MfaCard />}
      {!PREVIEW_MODE && <SessionsCard />}
      {!PREVIEW_MODE && <BlockedMembersCard />}
      {!PREVIEW_MODE && <DataPrivacyCard />}
    </>
  );
}
// "What am I part of?" overview on the member's own profile. Uses the
// owner-scoped read endpoints /me/network, /me/groups, /me/room-applications.
function MyConnectionsCard() {
  const [t, L] = useText();
  const network = useData("/me/network"),
    groups = useData("/me/groups"),
    rooms = useData("/me/room-applications");
  const roomStatus = {
    pending: L("قيد المراجعة", "Under review"),
    accepted: L("مقبول", "Accepted"),
    rejected: L("غير مقبول", "Not accepted"),
    cancelled: L("ملغي", "Cancelled"),
  };
  const groupStatus = { pending: L("بانتظار الموافقة", "Awaiting approval"), active: L("عضو", "Member") };
  return (
    <div className="settings-form security-box">
      <h2>{L("اتصالاتي", "My connections")}</h2>
      <h3>{L("من أتابعهم", "People I follow")}</h3>
      <Loadable loading={network.loading} error={network.error}>
        {network.data?.items?.length ? (
          <div className="skill-list">
            {network.data.items.map((m) => (
              <Link key={m.id} to={`/members/${m.username}`} className="chip-link">
                {m.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">
            {L("لا تتابع أحدًا بعد.", "You aren't following anyone yet.")}{" "}
            <Link to="/members">{t.members}</Link>
          </p>
        )}
      </Loadable>
      <h3>{L("مجموعاتي", "My groups")}</h3>
      <Loadable loading={groups.loading} error={groups.error}>
        {groups.data?.items?.length ? (
          <div className="sessions-list">
            {groups.data.items.map((g) => (
              <div className="session-row" key={g.id}>
                <strong>{L(g.Group?.nameAr, g.Group?.nameEn)}</strong>
                <small>{groupStatus[g.status] || g.status}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            {L("لست عضوًا في مجموعات.", "You haven't joined any groups.")}{" "}
            <Link to="/participation">{L("استكشف", "Explore")}</Link>
          </p>
        )}
      </Loadable>
      <h3>{L("طلبات الغرف", "My room applications")}</h3>
      <Loadable loading={rooms.loading} error={rooms.error}>
        {rooms.data?.items?.length ? (
          <div className="sessions-list">
            {rooms.data.items.map((a) => (
              <div className="session-row" key={a.id}>
                <strong>{a.Room?.title}</strong>
                <small>{roomStatus[a.status] || a.status}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{L("لا توجد طلبات غرف.", "No room applications.")}</p>
        )}
      </Loadable>
    </div>
  );
}
// Shared avatar renderer: photo when present, initial otherwise.
function AvatarImage({ person, className = "profile-avatar" }) {
  return (
    <span className={className}>
      {person?.avatarUrl ? (
        <img src={person.avatarUrl} alt="" loading="lazy" />
      ) : (
        person?.name?.charAt(0)
      )}
    </span>
  );
}
// Re-encode in the browser: caps dimensions (bandwidth) and drops all
// metadata including EXIF GPS, which a raw upload would leak to other members.
function resizeToDataUrl(file, max = 512) {
  return new Promise((resolve, reject) => {
    // Read via FileReader (a data: URL), NOT URL.createObjectURL: the app's
    // Content-Security-Policy allows `img-src data:` but not `blob:`, so a blob
    // URL makes the browser refuse to decode the image and every upload fails.
    // (Found by the real-browser E2E suite.)
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("invalid_image"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => reject(new Error("invalid_image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
// --- Settings: profile photo (wires POST/DELETE /users/me/avatar) ---------
function AvatarCard() {
  const { user, setUser, setToast } = useApp();
  const [, L] = useText();
  const [busy, setBusy] = useState(false);
  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setToast(L("اختر صورة بحجم أقل من ١٥ ميجابايت", "Choose an image under 15 MB"));
      return;
    }
    setBusy(true);
    try {
      const image = await resizeToDataUrl(file);
      const r = await api("/users/me/avatar", {
        method: "POST",
        body: JSON.stringify({ image }),
      });
      setUser({ ...user, avatarUrl: r.avatarUrl });
      setToast(L("تم تحديث الصورة", "Photo updated"));
    } catch (err) {
      setToast(
        {
          invalid_image: L("تعذر قراءة الصورة", "Could not read that image"),
          file_too_large: L("الصورة كبيرة جدًا", "Image is too large"),
        }[err.message] || err.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("/users/me/avatar", { method: "DELETE" });
      setUser({ ...user, avatarUrl: "" });
      setToast(L("تمت إزالة الصورة", "Photo removed"));
    } catch (err) {
      setToast(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-form security-box">
      <h2>{L("الصورة الشخصية", "Profile photo")}</h2>
      <div className="avatar-row">
        <AvatarImage person={user} className="profile-avatar" />
        <div>
          <label className="button button-outline" aria-disabled={busy}>
            {L("رفع صورة", "Upload photo")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPick}
              disabled={busy}
              hidden
            />
          </label>
          {user.avatarUrl && (
            <button className="button button-outline" onClick={remove} disabled={busy}>
              {L("إزالة", "Remove")}
            </button>
          )}
          <p className="muted">
            {L(
              "تُصغَّر الصورة وتُزال بياناتها الوصفية (مثل الموقع) قبل الرفع.",
              "Your photo is resized and its metadata (such as location) is stripped before upload.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
// --- Settings: email verification status + resend ------------------------
function EmailVerificationCard() {
  const { user, setToast } = useApp();
  const [, L] = useText();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (user.emailVerified) {
    return (
      <div className="settings-form security-box">
        <h2>{L("البريد الإلكتروني", "Email")}</h2>
        <p className="verified-badge">
          <CheckCircle2 size={16} />
          {L("بريدك الإلكتروني مُوثّق", "Your email is verified")}
        </p>
      </div>
    );
  }
  async function resend() {
    setBusy(true);
    try {
      await api("/auth/resend-verification", { method: "POST" });
      setSent(true);
      setToast(L("أرسلنا رابط التوثيق", "We sent a verification link"));
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-form security-box warn-box">
      <h2>{L("وثّق بريدك الإلكتروني", "Verify your email")}</h2>
      <p>
        {L(
          "بعض الميزات تتطلب توثيق البريد الإلكتروني. تحقق من بريدك أو أعد إرسال الرابط.",
          "Some features require a verified email. Check your inbox or resend the link.",
        )}
      </p>
      <button className="button button-accent" onClick={resend} disabled={busy || sent}>
        {sent
          ? L("تم الإرسال", "Sent")
          : L("أعد إرسال رابط التوثيق", "Resend verification link")}
        <Mail size={16} />
      </button>
    </div>
  );
}
// --- Settings: change password -------------------------------------------
function ChangePasswordCard() {
  const { setToast, user } = useApp();
  const [, L] = useText();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (form.newPassword !== form.confirm)
      return setToast(L("كلمتا المرور غير متطابقتين", "Passwords do not match"));
    setBusy(true);
    try {
      await api("/users/me/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      setToast(L("تم تغيير كلمة المرور", "Password changed"));
    } catch (e) {
      setToast(
        {
          invalid_current_password: L("كلمة المرور الحالية غير صحيحة", "Current password is incorrect"),
          weak_password: L("كلمة المرور ضعيفة (١٠ أحرف وأرقام)", "Weak password (10+ chars, letters & digits)"),
          password_unchanged: L("اختر كلمة مرور مختلفة", "Choose a different password"),
        }[e.message] || e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  if (user && user.hasPassword === false)
    return (
      <div className="settings-form security-box">
        <h2>{L("كلمة المرور", "Password")}</h2>
        <p>
          {L(
            "تسجّل الدخول عبر Google. لإضافة كلمة مرور لحسابك استخدم رابط إعادة التعيين المرسل لبريدك.",
            "You sign in with Google. To add a password, use the reset link we email you.",
          )}
        </p>
        <Link className="button button-outline" to="/forgot-password">
          {L("أرسل رابط تعيين كلمة المرور", "Email me a set-password link")}
        </Link>
      </div>
    );
  return (
    <form className="settings-form security-box" onSubmit={submit}>
      <h2>{L("كلمة المرور", "Password")}</h2>
      <label>
        {L("كلمة المرور الحالية", "Current password")}
        <input
          type="password"
          required
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
        />
      </label>
      <div className="form-columns">
        <label>
          {L("كلمة المرور الجديدة", "New password")}
          <input
            type="password"
            required
            minLength="10"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
        </label>
        <label>
          {L("تأكيد كلمة المرور", "Confirm password")}
          <input
            type="password"
            required
            minLength="10"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </label>
      </div>
      <button className="button button-accent" disabled={busy}>
        {L("تحديث كلمة المرور", "Update password")}
        <LockKeyhole size={16} />
      </button>
    </form>
  );
}
// --- Settings: two-factor authentication (TOTP) --------------------------
function MfaCard() {
  const { setToast, user, setUser } = useApp();
  const [, L] = useText();
  const [refresh, setRefresh] = useState(0);
  const { data: status } = useData("/auth/mfa/status", refresh);
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const errText = (m) =>
    ({
      invalid_mfa_code: L("الرمز غير صحيح", "That code is not valid"),
      invalid_credentials: L("كلمة المرور غير صحيحة", "Wrong password"),
      mfa_required_for_role: L(
        "حسابك يتطلب التحقق بخطوتين ولا يمكن إيقافه",
        "Your role requires two-factor and it cannot be turned off",
      ),
      mfa_unavailable: L(
        "التحقق بخطوتين غير مفعّل على الخادم",
        "Two-factor is not enabled on this server",
      ),
    })[m] || m;
  async function run(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToast(errText(e.message));
    } finally {
      setBusy(false);
    }
  }
  const startSetup = () =>
    run(async () => setSetup(await api("/auth/mfa/setup", { method: "POST", body: "{}" })));
  const enable = () =>
    run(async () => {
      const r = await api("/auth/mfa/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCodes(r.recoveryCodes);
      setSetup(null);
      setCode("");
      setUser({ ...user, mfaEnabled: true });
      setRefresh((x) => x + 1);
      setToast(L("تم تفعيل التحقق بخطوتين", "Two-factor enabled"));
    });
  const disable = () =>
    run(async () => {
      await api("/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({ password, code }),
      });
      setPassword("");
      setCode("");
      setCodes(null);
      setUser({ ...user, mfaEnabled: false });
      setRefresh((x) => x + 1);
      setToast(L("تم إيقاف التحقق بخطوتين", "Two-factor turned off"));
    });
  const regen = () =>
    run(async () => {
      const r = await api("/auth/mfa/recovery-codes", {
        method: "POST",
        body: JSON.stringify({ password, code }),
      });
      setCodes(r.recoveryCodes);
      setPassword("");
      setCode("");
      setRefresh((x) => x + 1);
    });
  if (status && status.available === false && !status.enabled) return null;
  return (
    <div className="settings-form security-box">
      <h2>{L("التحقق بخطوتين", "Two-factor authentication")}</h2>
      {status?.required && !status.enabled && (
        <p className="warn-box">
          {L(
            "دورك يتطلب تفعيل التحقق بخطوتين للوصول إلى أدوات الإدارة.",
            "Your role requires two-factor to use admin tools.",
          )}
        </p>
      )}
      {!status?.enabled && !setup && (
        <>
          <p>
            {L(
              "أضف طبقة حماية بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو Authy).",
              "Add a second step with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).",
            )}
          </p>
          <button className="button button-accent" type="button" onClick={startSetup} disabled={busy}>
            {L("ابدأ الإعداد", "Start setup")}
            <ShieldCheck size={16} />
          </button>
        </>
      )}
      {setup && (
        <>
          <p>
            {L(
              "أضف هذا المفتاح في تطبيق المصادقة (إدخال يدوي، نوع: قائم على الوقت) ثم أدخل الرمز المكوّن من ٦ أرقام.",
              "Add this key in your authenticator app (manual entry, time-based), then enter the 6-digit code.",
            )}
          </p>
          <code dir="ltr" className="mfa-secret">{setup.secret}</code>
          <a className="text-link" href={setup.otpauthUrl}>
            {L("افتح في تطبيق المصادقة", "Open in authenticator app")}
          </a>
          <label>
            {L("رمز التحقق", "Verification code")}
            <input
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength="6"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="button button-accent" type="button" onClick={enable} disabled={busy || code.length !== 6}>
            {L("تفعيل", "Enable")}
          </button>
        </>
      )}
      {codes && (
        <div className="warn-box">
          <strong>
            {L(
              "رموز الاسترداد — احفظها الآن، لن تظهر مرة أخرى:",
              "Recovery codes — save them now, they are shown only once:",
            )}
          </strong>
          <pre dir="ltr" className="mfa-codes">{codes.join("\n")}</pre>
        </div>
      )}
      {status?.enabled && (
        <>
          <p>
            {L("التحقق بخطوتين مفعّل.", "Two-factor is on.")}{" "}
            {L("رموز الاسترداد المتبقية: ", "Recovery codes left: ")}
            {status.recoveryCodesLeft}
          </p>
          <div className="form-columns">
            <label>
              {L("كلمة المرور", "Password")}
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label>
              {L("رمز من التطبيق أو رمز استرداد", "App code or recovery code")}
              <input dir="ltr" autoComplete="one-time-code" maxLength="32" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          </div>
          <div className="form-columns">
            <button className="button button-outline" type="button" onClick={regen} disabled={busy || !password || !code}>
              {L("رموز استرداد جديدة", "New recovery codes")}
            </button>
            {!status.required && (
              <button className="button button-outline" type="button" onClick={disable} disabled={busy || !password || !code}>
                {L("إيقاف التحقق بخطوتين", "Turn off two-factor")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
// --- Settings: active sessions / devices ---------------------------------
function SessionsCard() {
  const [, L] = useText();
  const { setToast } = useApp();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData("/users/me/sessions", refresh);
  async function revoke(id) {
    try {
      await api(`/users/me/sessions/${id}`, { method: "DELETE" });
      setRefresh((x) => x + 1);
      setToast(L("تم إنهاء الجلسة", "Session ended"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="settings-form security-box">
      <h2>{L("الجلسات والأجهزة", "Sessions & devices")}</h2>
      <Loadable loading={loading} error={error} onRetry={() => setRefresh((x) => x + 1)}>
        <div className="sessions-list">
          {data?.items?.map((s) => (
            <div className="session-row" key={s.id}>
              <div>
                <strong>
                  {s.userAgent?.slice(0, 60) || L("جهاز غير معروف", "Unknown device")}
                  {s.current && (
                    <span className="session-current">
                      {" "}
                      · {L("الجلسة الحالية", "This device")}
                    </span>
                  )}
                </strong>
                <small>
                  {s.ip} · {new Date(s.lastSeenAt || s.createdAt).toLocaleString()}
                </small>
              </div>
              {!s.current && (
                <button className="button button-outline" onClick={() => revoke(s.id)}>
                  {L("إنهاء", "End")}
                </button>
              )}
            </div>
          ))}
        </div>
      </Loadable>
      <button
        className="button button-outline"
        onClick={async () => {
          await api("/auth/logout-all", { method: "POST" });
          location.assign("/login");
        }}
      >
        {L("تسجيل الخروج من كل الأجهزة", "Sign out on all devices")}
        <LogOut size={17} />
      </button>
    </div>
  );
}
// --- Settings: blocked members (unblock) ---------------------------------
function BlockedMembersCard() {
  const [, L] = useText();
  const { setToast } = useApp();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData("/me/blocks", refresh);
  async function unblock(id) {
    try {
      await api(`/members/${id}/block`, { method: "DELETE" });
      setRefresh((x) => x + 1);
      setToast(L("تم إلغاء الحظر", "Member unblocked"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="settings-form security-box">
      <h2>{L("الأعضاء المحظورون", "Blocked members")}</h2>
      <Loadable loading={loading} error={error} onRetry={() => setRefresh((x) => x + 1)}>
        {data?.items?.length ? (
          <div className="sessions-list">
            {data.items.map((b) => (
              <div className="session-row" key={b.id}>
                <div>
                  <strong>{b.name}</strong>
                  <small>@{b.username}</small>
                </div>
                <button className="button button-outline" onClick={() => unblock(b.id)}>
                  {L("إلغاء الحظر", "Unblock")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            {L("لا يوجد أعضاء محظورون.", "You have not blocked anyone.")}
          </p>
        )}
      </Loadable>
    </div>
  );
}
// --- Settings: data export + account deletion ----------------------------
function DataPrivacyCard() {
  const { setToast } = useApp();
  const navigate = useNavigate();
  const [, L] = useText();
  const [busy, setBusy] = useState(false);
  async function exportData() {
    try {
      const data = await api("/users/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "usam-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
      setToast(L("تم تنزيل بياناتك", "Your data was downloaded"));
    } catch (e) {
      setToast(e.message);
    }
  }
  const { user } = useApp();
  const [deleting, setDeleting] = useState(false);
  const [del, setDel] = useState({ confirm: "", password: "", mfaCode: "", deleteContent: false });
  async function deleteAccount(e) {
    e.preventDefault();
    if (del.confirm !== "DELETE") return;
    setBusy(true);
    try {
      await api("/users/me", {
        method: "DELETE",
        body: JSON.stringify(del),
      });
      setToast(L("تم حذف الحساب", "Account deleted"));
      navigate("/");
      location.reload();
    } catch (e) {
      setToast(
        {
          invalid_current_password: L("كلمة المرور غير صحيحة", "Wrong password"),
          invalid_mfa_code: L("رمز التحقق غير صحيح", "Wrong two-factor code"),
          confirmation_required: L("اكتب DELETE للتأكيد", "Type DELETE to confirm"),
          reauthentication_required: L(
            "سجّل الخروج ثم الدخول عبر Google مرة أخرى، ثم احذف الحساب خلال ١٥ دقيقة.",
            "Sign out and back in with Google, then delete within 15 minutes.",
          ),
        }[e.message] || e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-form security-box">
      <h2>{L("البيانات والخصوصية", "Data & privacy")}</h2>
      <p>
        {L(
          "نزّل نسخة من بياناتك، أو احذف حسابك نهائيًا.",
          "Download a copy of your data, or permanently delete your account.",
        )}
      </p>
      <div className="form-columns">
        <button className="button button-outline" onClick={exportData}>
          {L("تنزيل بياناتي", "Export my data")}
          <ArrowUpLeft size={16} />
        </button>
        <button
          className="button button-danger"
          type="button"
          onClick={() => setDeleting((x) => !x)}
          disabled={busy}
        >
          {L("حذف الحساب", "Delete account")}
          <AlertCircle size={16} />
        </button>
      </div>
      {deleting && (
        <form className="danger-zone" onSubmit={deleteAccount}>
          <p>
            {L(
              "سيُحذف ملفك وجلساتك وعلاقاتك فورًا، وتُلغى اشتراكاتك وتسجيلاتك. تبقى سجلات الدفع لأغراض محاسبية.",
              "Your profile, sessions and connections are removed immediately, and your plans and registrations are cancelled. Payment records are kept for accounting.",
            )}
          </p>
          {user?.hasPassword === false ? (
            <p className="muted">
              {L(
                "للتأكيد، يجب أن تكون قد سجّلت الدخول عبر Google خلال آخر ١٥ دقيقة.",
                "To confirm, you must have signed in with Google within the last 15 minutes.",
              )}
            </p>
          ) : (
            <label>
              {L("كلمة المرور", "Password")}
              <input
                type="password"
                required
                autoComplete="current-password"
                value={del.password}
                onChange={(e) => setDel({ ...del, password: e.target.value })}
              />
            </label>
          )}
          {user?.mfaEnabled && (
            <label>
              {L("رمز التحقق بخطوتين", "Two-factor code")}
              <input
                dir="ltr"
                required
                autoComplete="one-time-code"
                value={del.mfaCode}
                onChange={(e) => setDel({ ...del, mfaCode: e.target.value })}
              />
            </label>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={del.deleteContent}
              onChange={(e) => setDel({ ...del, deleteContent: e.target.checked })}
            />
            {L(
              "احذف أيضًا منشوراتي وتعليقاتي وصوري",
              "Also remove my posts, comments and images",
            )}
          </label>
          <label>
            {L("اكتب DELETE للتأكيد", "Type DELETE to confirm")}
            <input
              dir="ltr"
              required
              value={del.confirm}
              onChange={(e) => setDel({ ...del, confirm: e.target.value })}
            />
          </label>
          <button
            className="button button-danger"
            disabled={busy || del.confirm !== "DELETE" || (user?.hasPassword !== false && !del.password)}
          >
            {L("احذف حسابي نهائيًا", "Permanently delete my account")}
          </button>
        </form>
      )}
    </div>
  );
}
function Notifications() {
  const [t, L] = useText();
  const { setToast, liveTick } = useApp();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData("/notifications", refresh + liveTick);
  const [older, setOlder] = useState([]),
    [olderCursor, setOlderCursor] = useState(undefined),
    [loadingOlder, setLoadingOlder] = useState(false);
  const cursor = olderCursor === undefined ? data?.nextBefore : olderCursor;
  async function loadMore() {
    setLoadingOlder(true);
    try {
      const p = await api(`/notifications?before=${encodeURIComponent(cursor)}`);
      setOlder((x) => [...x, ...p.items]);
      setOlderCursor(p.nextBefore || null);
    } catch (e) {
      setToast(e.message);
    } finally {
      setLoadingOlder(false);
    }
  }
  const unreadCount =
    data?.unreadCount ?? (data?.items?.filter((n) => !n.readAt).length || 0);
  async function markAllRead() {
    try {
      await api("/notifications/read-all", { method: "PATCH" });
      setRefresh((x) => x + 1);
      setToast(L("تم تعليم الكل كمقروء", "Marked all as read"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow={L("ابقَ على اطلاع", "STAY IN THE LOOP")}
        title={t.notifications}
      />
      <div className="narrow-content">
        {unreadCount > 0 && (
          <div className="notifications-toolbar">
            <span>
              {L(`${unreadCount} غير مقروء`, `${unreadCount} unread`)}
            </span>
            <button className="button button-outline" onClick={markAllRead}>
              <CheckCircle2 size={16} />
              {L("تعليم الكل كمقروء", "Mark all read")}
            </button>
          </div>
        )}
        <Loadable loading={loading} error={error}>
          {data?.items?.length ? (
            <div className="notifications-list">
              {[...data.items, ...older.filter((o) => !data.items.some((n) => n.id === o.id))].map((n) => (
                <Link
                  key={n.id}
                  className={`notification ${n.readAt ? "" : "unread"}`}
                  to={n.href || "/home"}
                  onClick={async () => {
                    await api(`/notifications/${n.id}/read`, {
                      method: "PATCH",
                    });
                    setRefresh((x) => x + 1);
                  }}
                >
                  <span className="notification-icon">
                    <Bell size={19} />
                  </span>
                  <span>
                    <strong>{n.text}</strong>
                    <small>{new Date(n.createdAt).toLocaleString()}</small>
                  </span>
                  <ArrowUpLeft size={18} />
                </Link>
              ))}
              {cursor && (
                <button
                  type="button"
                  className="button button-outline load-older"
                  onClick={loadMore}
                  disabled={loadingOlder}
                >
                  {L("عرض المزيد", "Show more")}
                </button>
              )}
            </div>
          ) : (
            <Empty
              icon={Bell}
              title={L("كل شيء هادئ حاليًا", "All quiet for now")}
              body={L(
                "ستظهر هنا تحديثات أنشطتك وتفاعلاتك.",
                "Updates about your activity and interactions will appear here.",
              )}
            />
          )}
        </Loadable>
      </div>
    </>
  );
}
function SearchPage() {
  const [t, L] = useText();
  const [q, setQ] = useState(
      new URLSearchParams(useLocation().search).get("q") || "",
    ),
    [submitted, setSubmitted] = useState("");
  const { data, loading, error } = useData(
    `/search?q=${encodeURIComponent(submitted)}`,
  );
  return (
    <>
      <AppHeading
        eyebrow={L("اعثر على ما يهمك", "FIND WHAT MATTERS")}
        title={t.search}
        description={L(
          "ابحث عن أعضاء ومنشورات وفعاليات منشورة.",
          "Search published members, posts and events.",
        )}
      />
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q);
        }}
      >
        <Search size={20} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          minLength="2"
          placeholder={L(
            "اسم، موضوع، أو فعالية...",
            "Name, topic, or event...",
          )}
          autoFocus
        />
        <button className="button button-accent">{t.search}</button>
      </form>
      {submitted.length >= 2 && (
        <Loadable loading={loading} error={error}>
          <div className="search-results">
            <h2>
              {t.members} <span>{data?.members?.length || 0}</span>
            </h2>
            {data?.members?.map((m) => (
              <Link
                key={m.id}
                to={`/members/${m.username}`}
                className="search-item"
              >
                <UserRound size={19} />
                {m.name}
                <ArrowUpLeft size={16} />
              </Link>
            ))}
            <h2>
              {t.events} <span>{data?.events?.length || 0}</span>
            </h2>
            {data?.events?.map((e) => (
              <Link key={e.id} to={`/events/${e.id}`} className="search-item">
                <CalendarDays size={19} />
                {e.title}
                <ArrowUpLeft size={16} />
              </Link>
            ))}
            <h2>
              {t.feed} <span>{data?.posts?.length || 0}</span>
            </h2>
            <PostList posts={data?.posts || []} />
          </div>
        </Loadable>
      )}
    </>
  );
}
function OrganizationNew() {
  const [t, L] = useText();
  const { setToast } = useApp(),
    navigate = useNavigate();
  const [form, setForm] = useState({ name: "", sector: "", description: "" });
  async function submit(e) {
    e.preventDefault();
    try {
      await api("/organizations", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setToast(
        L("أُرسل طلب المؤسسة للمراجعة", "Organization submitted for review"),
      );
      navigate("/organizations");
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow={t.organizations}
        title={L("قدّم مؤسستك", "Submit your organization")}
        description={L(
          "كل مؤسسة تمر بمراجعة الإدارة قبل أن تظهر في الدليل.",
          "Every organization is reviewed before appearing in the directory.",
        )}
      />
      <form className="settings-form" onSubmit={submit}>
        <label>
          {L("اسم المؤسسة", "Organization name")}
          <input
            required
            minLength="2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {L("القطاع", "Sector")}
          <input
            value={form.sector}
            onChange={(e) => setForm({ ...form, sector: e.target.value })}
          />
        </label>
        <label>
          {L("نبذة", "Description")}
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <button className="button button-accent">
          {L("إرسال للمراجعة", "Submit for review")}
          <ArrowUpLeft size={17} />
        </button>
      </form>
    </>
  );
}
function Opportunities() {
  const [t, L] = useText();
  return (
    <>
      <AppHeading
        eyebrow={L("الخطوة المهنية التالية", "YOUR NEXT PROFESSIONAL STEP")}
        title={t.jobs}
        description={L(
          "تدار الوظائف وفرص التقديم عبر USAM Career & Jobs، مصدرها المعتمد.",
          "Jobs and applications are handled in USAM Career & Jobs, their source of truth.",
        )}
      />
      <div className="external-journey">
        <span className="external-journey-icon">
          <BriefcaseBusiness size={41} />
        </span>
        <h2>USAM Career & Jobs</h2>
        <p>
          {L(
            "استكشف الفرص وأكمل التقديم داخل منصة الوظائف. قد تحتاج إلى تسجيل دخول مستقل لحين اكتمال الحساب الموحد.",
            "Explore opportunities and complete applications on the Jobs platform. Separate sign in may be required until unified accounts are available.",
          )}
        </p>
        <a
          href="https://jobs.usamif.com"
          target="_blank"
          rel="noreferrer"
          className="button button-accent"
        >
          {L("اذهب إلى الوظائف", "Explore Jobs")}
          <ExternalLink size={18} />
        </a>
      </div>
    </>
  );
}
function ParticipationPage() {
  const [t, L] = useText();
  const { user, setToast, flag } = useApp();
  const [tab, setTab] = useState("groups"),
    [refresh, setRefresh] = useState(0);
  const [roomText, setRoomText] = useState({}),
    [searchForm, setSearchForm] = useState({ label: "", query: "" });
  const [partnerForm, setPartnerForm] = useState({
    organizationName: "",
    contactEmail: user?.email || "",
    objective: "",
  });
  const groups = useData("/groups", refresh),
    roomList = useData("/curated-rooms", refresh),
    saved = useData("/saved-searches", refresh),
    preferences = useData("/notification-preferences", refresh),
    partnerships = useData("/partnerships/mine", refresh),
    organizations = useData("/organizations/mine", refresh);
  const [prefs, setPrefs] = useState(null);
  useEffect(() => {
    if (preferences.data?.item) setPrefs(preferences.data.item);
  }, [preferences.data]);
  async function run(url, options, message) {
    try {
      await api(url, options);
      setRefresh((x) => x + 1);
      setToast(message);
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow={L("مسارات المشاركة", "PARTICIPATION WORKFLOWS")}
        title={L("إدارة مشاركتك", "Participation hub")}
        description={L(
          "المجموعات والغرف المحررة والبحث المحفوظ والشراكات في مكان واحد.",
          "Groups, curated rooms, saved searches and partnership requests in one place.",
        )}
      />
      <div className="admin-tabs participation-tabs">
        {[
          ["groups", L("المجموعات والفروع", "Groups & chapters")],
          ["rooms", L("طلبات الغرف", "Room applications"), "rooms_applications"],
          ["searches", L("البحث المحفوظ", "Saved searches"), "saved_searches"],
          ["preferences", L("تفضيلات الإشعارات", "Notification preferences")],
          ["partnerships", L("الشراكات", "Partnerships"), "partnership_requests"],
          ["teams", L("فرق المؤسسات", "Organization teams")],
        ]
          .filter(([, , flagKey]) => !flagKey || flag(flagKey))
          .map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "groups" && (
        <Loadable loading={groups.loading} error={groups.error}>
          <div className="directory-grid">
            {groups.data?.items?.map((g) => (
              <article className="directory-card" key={g.id}>
                <div className="directory-card-top">
                  <span className="directory-icon">
                    <Users size={22} />
                  </span>
                  <span className="directory-index">
                    {g.type?.toUpperCase()}
                  </span>
                </div>
                <h2>{L(g.nameAr, g.nameEn)}</h2>
                <p>{g.description}</p>
                <div className="directory-meta">
                  <span>
                    {g.Community?.nameEn} · {g.visibility}
                  </span>
                </div>
                <button
                  className="button button-accent small-button"
                  onClick={() =>
                    run(
                      `/groups/${g.id}/join`,
                      {
                        method:
                          g.membership && g.membership.status !== "left"
                            ? "DELETE"
                            : "POST",
                      },
                      g.membership
                        ? L("تم تحديث العضوية", "Membership updated")
                        : L("تم إرسال طلب الانضمام", "Join request sent"),
                    )
                  }
                >
                  {g.membership && g.membership.status !== "left"
                    ? L("مغادرة", "Leave")
                    : L("انضم", "Join")}
                </button>
                {g.membership && (
                  <small>
                    {L("الحالة", "Status")}: {g.membership.status}
                  </small>
                )}
              </article>
            ))}
          </div>
        </Loadable>
      )}
      {tab === "rooms" && (
        <Loadable loading={roomList.loading} error={roomList.error}>
          <div className="directory-grid">
            {roomList.data?.items?.map((room) => (
              <article className="directory-card" key={room.id}>
                <div className="directory-card-top">
                  <span className="directory-icon">
                    <Layers size={22} />
                  </span>
                  <span className="directory-index">CURATED ROOM</span>
                </div>
                <h2>{room.title}</h2>
                <p>{room.description}</p>
                <div className="directory-meta">
                  <span>
                    {room.Community?.nameEn} · {room.capacity}{" "}
                    {L("مقعد", "seats")}
                  </span>
                </div>
                {room.application ? (
                  <RoomApplicationStatus
                    application={room.application}
                    onChanged={() => setRefresh((x) => x + 1)}
                  />
                ) : (
                  <>
                    <textarea
                      value={roomText[room.id] || ""}
                      onChange={(e) =>
                        setRoomText({ ...roomText, [room.id]: e.target.value })
                      }
                      placeholder={L(
                        "اشرح لماذا تريد المشاركة (20 حرفًا على الأقل)",
                        "Why do you want to join? (20 characters minimum)",
                      )}
                    />
                    <button
                      className="button button-accent small-button"
                      onClick={() =>
                        run(
                          `/curated-rooms/${room.id}/applications`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              motivation: roomText[room.id] || "",
                            }),
                          },
                          L("تم إرسال الطلب للمراجعة", "Application submitted"),
                        )
                      }
                    >
                      {L("قدّم طلبًا", "Apply")}
                    </button>
                  </>
                )}
              </article>
            ))}
          </div>
        </Loadable>
      )}
      {tab === "searches" && (
        <div className="settings-form">
          <h2>{L("احفظ بحثًا للعودة إليه", "Save a search for later")}</h2>
          <div className="form-columns">
            <label>
              {L("اسم البحث", "Label")}
              <input
                value={searchForm.label}
                onChange={(e) =>
                  setSearchForm({ ...searchForm, label: e.target.value })
                }
              />
            </label>
            <label>
              {L("عبارة البحث", "Query")}
              <input
                value={searchForm.query}
                onChange={(e) =>
                  setSearchForm({ ...searchForm, query: e.target.value })
                }
              />
            </label>
          </div>
          <button
            className="button button-accent"
            onClick={() =>
              run(
                "/saved-searches",
                { method: "POST", body: JSON.stringify(searchForm) },
                L("تم حفظ البحث", "Search saved"),
              )
            }
          >
            {L("حفظ البحث", "Save search")}
          </button>
          {saved.data?.items?.map((x) => (
            <div className="admin-row" key={x.id}>
              <Link to={`/search?q=${encodeURIComponent(x.query)}`}>
                <strong>{x.label}</strong>
                <p>{x.query}</p>
              </Link>
              <button
                onClick={() =>
                  run(
                    `/saved-searches/${x.id}`,
                    { method: "DELETE" },
                    L("تم الحذف", "Deleted"),
                  )
                }
              >
                {L("حذف", "Delete")}
              </button>
            </div>
          ))}
        </div>
      )}
      {tab === "preferences" && prefs && (
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              "/notification-preferences",
              { method: "PUT", body: JSON.stringify(prefs) },
              L("تم حفظ التفضيلات", "Preferences saved"),
            );
          }}
        >
          <h2>
            {L("كيف تريد استقبال التحديثات؟", "How should updates reach you?")}
          </h2>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={!!prefs.inApp}
              onChange={(e) => setPrefs({ ...prefs, inApp: e.target.checked })}
            />
            <span>
              <strong>{L("داخل المنصة", "In-app notifications")}</strong>
            </span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={!!prefs.email}
              onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
            />
            <span>
              <strong>{L("إشعارات بالبريد الإلكتروني", "Email notifications")}</strong>
              <small>
                {L(
                  "إن كان الملخص «متوقف» نرسل بريدًا فور حدوث النشاط، وإلا نجمعها في الملخص.",
                  "With the digest set to Off we email you right away; otherwise updates are batched into the digest.",
                )}
              </small>
            </span>
          </label>
          <label>
            {L("ملخص الإشعارات", "Digest")}
            <select
              value={prefs.digest}
              onChange={(e) => setPrefs({ ...prefs, digest: e.target.value })}
            >
              <option value="off">{L("متوقف", "Off")}</option>
              <option value="daily">{L("يومي", "Daily")}</option>
              <option value="weekly">{L("أسبوعي", "Weekly")}</option>
            </select>
          </label>
          <button className="button button-accent">
            {L("حفظ التفضيلات", "Save preferences")}
          </button>
        </form>
      )}
      {tab === "partnerships" && (
        <div className="settings-form">
          <h2>{L("طلب شراكة جديد", "New partnership request")}</h2>
          <label>
            {L("اسم المؤسسة", "Organization name")}
            <input
              value={partnerForm.organizationName}
              onChange={(e) =>
                setPartnerForm({
                  ...partnerForm,
                  organizationName: e.target.value,
                })
              }
            />
          </label>
          <label>
            {L("بريد التواصل", "Contact email")}
            <input
              type="email"
              value={partnerForm.contactEmail}
              onChange={(e) =>
                setPartnerForm({ ...partnerForm, contactEmail: e.target.value })
              }
            />
          </label>
          <label>
            {L("الهدف والنتيجة المتوقعة", "Objective and expected outcome")}
            <textarea
              minLength="30"
              value={partnerForm.objective}
              onChange={(e) =>
                setPartnerForm({ ...partnerForm, objective: e.target.value })
              }
            />
          </label>
          <button
            className="button button-accent"
            onClick={() =>
              run(
                "/partnerships",
                { method: "POST", body: JSON.stringify(partnerForm) },
                L("تم إرسال طلب الشراكة", "Partnership request submitted"),
              )
            }
          >
            {L("إرسال للمراجعة", "Submit for review")}
          </button>
          {partnerships.data?.items?.map((x) => (
            <div className="admin-row" key={x.id}>
              <div>
                <strong>{x.organizationName}</strong>
                <p>{x.objective}</p>
              </div>
              <span className="status-pill">{x.status}</span>
            </div>
          ))}
        </div>
      )}
      {tab === "teams" && (
        <Loadable loading={organizations.loading} error={organizations.error}>
          {organizations.data?.items?.length ? (
            <div className="settings-form">
              {organizations.data.items.map((org) => (
                <OrganizationTeamCard key={org.id} org={org} onChanged={() => setRefresh((x) => x + 1)} />
              ))}
            </div>
          ) : (
            <Empty
              icon={Building2}
              title={L(
                "لا توجد مؤسسة مرتبطة بحسابك",
                "No organization is linked to your account",
              )}
              action={L("قدّم مؤسستك", "Submit organization")}
              href="/organization/new"
            />
          )}
        </Loadable>
      )}
    </>
  );
}
// Member-side room application controls: withdraw / release a seat, and leave
// a rating + feedback after being checked in (wires PATCH /room-applications/:id,
// previously API-only).
function RoomApplicationStatus({ application, onChanged }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const labels = {
    pending: L("قيد المراجعة", "Under review"),
    accepted: L("مقبول", "Accepted"),
    rejected: L("غير مقبول", "Not accepted"),
    cancelled: L("ملغي", "Cancelled"),
  };
  async function patch(body, okMessage) {
    setBusy(true);
    try {
      await api(`/room-applications/${application.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setToast(okMessage);
      onChanged();
    } catch (e) {
      setToast(
        e.message === "invalid_feedback"
          ? L("اكتب ملاحظات لا تقل عن ١٠ أحرف", "Please write at least 10 characters of feedback")
          : e.message === "invalid_transition"
            ? L("لا يمكن تنفيذ هذا الإجراء الآن", "That action isn't available right now")
            : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  const canCancel =
    ["pending", "accepted"].includes(application.status) && !application.checkedInAt;
  const canReview =
    application.status === "accepted" && application.checkedInAt && !application.rating;
  return (
    <div className="room-application">
      <strong>
        {L("حالة الطلب", "Application")}: {labels[application.status] || application.status}
      </strong>
      {canCancel && (
        <button
          className="button button-outline small-button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(L("إلغاء مشاركتك في هذه الغرفة؟", "Cancel your place in this room?")))
              patch({ action: "cancel" }, L("تم الإلغاء", "Cancelled"));
          }}
        >
          {application.status === "accepted"
            ? L("إلغاء مقعدي", "Release my seat")
            : L("سحب الطلب", "Withdraw application")}
        </button>
      )}
      {canReview && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            patch(
              { action: "feedback", rating: Number(rating), feedback },
              L("شكرًا على ملاحظاتك", "Thanks for your feedback"),
            );
          }}
        >
          <label>
            {L("التقييم", "Rating")}
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} / 5</option>
              ))}
            </select>
          </label>
          <textarea
            required
            minLength="10"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={L("كيف كانت التجربة؟", "How was the session?")}
          />
          <button className="button button-accent small-button" disabled={busy}>
            {L("إرسال التقييم", "Submit feedback")}
          </button>
        </form>
      )}
      {application.rating ? (
        <small>{L("تقييمك", "Your rating")}: {application.rating} / 5</small>
      ) : null}
    </div>
  );
}
// Add/remove members for an organization the current user owns or administers
// (wires POST /organizations/:id/team and PATCH .../team/:memberId, which
// previously had models + API but no UI control).
function OrganizationAnalytics({ orgId }) {
  const [, L] = useText();
  const { data, loading, error } = useData(`/organizations/${orgId}/analytics`);
  const max = Math.max(1, ...(data?.team?.growthByMonth || []).map((m) => m.joined));
  return (
    <Loadable loading={loading} error={error}>
      {data && (
        <div className="org-analytics">
          <div className="stat-grid">
            {[
              [data.team.size, L("حجم الفريق", "Team size"), Users],
              [data.team.joinedLast30Days, L("انضموا آخر ٣٠ يومًا", "Joined in 30 days"), Plus],
              [data.engagementLast30Days.posts, L("منشورات ٣٠ يومًا", "Posts (30 days)"), MessageCircle],
              [data.engagementLast30Days.activePosters, L("أعضاء نشطون", "Active posters"), UserRound],
              [data.engagementLast30Days.eventRegistrations, L("تسجيلات فعاليات", "Event registrations"), CalendarDays],
              [data.engagementLast30Days.eventCheckIns, L("حضور فعلي", "Check-ins"), BadgeCheck],
            ].map(([value, label, Icon]) => (
              <div className="stat-card" key={label}>
                <Icon size={20} />
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <h3>{L("نمو الفريق (٦ أشهر)", "Team growth (6 months)")}</h3>
          <div className="org-bars" role="list">
            {data.team.growthByMonth.map((m) => (
              <div key={m.month} role="listitem" className="org-bar" title={`${m.month}: ${m.joined}`}>
                <span style={{ blockSize: `${(m.joined / max) * 100}%` }} />
                <small>{m.month.slice(5)}</small>
                <b>{m.joined}</b>
              </div>
            ))}
          </div>
          <p className="muted">
            {L("المجتمعات", "Communities")}:{" "}
            {Object.entries(data.communities)
              .map(([k, v]) => `${personaData.find((p) => p.slug === k)?.name || k} ${v}`)
              .join(" · ") || "—"}
          </p>
        </div>
      )}
    </Loadable>
  );
}
function OrganizationTeamCard({ org, onChanged }) {
  const [, L] = useText();
  const { setToast, user } = useApp();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const active = (org.OrganizationMembers || []).filter((m) => m.status !== "removed");
  const myRole = org.myRole || "owner";
  const isOwner = myRole === "owner" || ["admin", "super_admin"].includes(user?.role);
  const canManage = isOwner || myRole === "admin";
  const myRow = active.find((m) => m.UserId === user?.id || m.User?.id === user?.id);
  async function changeRole(memberId, next) {
    try {
      await api(`/organizations/${org.id}/team/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: next }),
      });
      setToast(L("تم تحديث الدور", "Role updated"));
      onChanged();
    } catch (e) {
      setToast(e.message);
    }
  }
  async function leave() {
    if (!myRow || !window.confirm(L("مغادرة هذا الفريق؟", "Leave this team?"))) return;
    try {
      await api(`/organizations/${org.id}/team/${myRow.id}`, { method: "PATCH", body: "{}" });
      setToast(L("غادرت الفريق", "You left the team"));
      onChanged();
    } catch (e) {
      setToast(e.message);
    }
  }
  async function add(e) {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    try {
      await api(`/organizations/${org.id}/team`, {
        method: "POST",
        body: JSON.stringify({ username: username.trim(), role }),
      });
      setUsername("");
      setToast(L("تمت إضافة العضو للفريق", "Member added to the team"));
      onChanged();
    } catch (e) {
      setToast(
        {
          invalid_member: L("لم يتم العثور على العضو بهذا الاسم", "No member found with that username"),
          organization_not_approved: L("المؤسسة لم تُعتمد بعد", "Organization is not approved yet"),
        }[e.message] || e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(memberId) {
    if (!window.confirm(L("إزالة هذا العضو من الفريق؟", "Remove this member from the team?"))) return;
    try {
      await api(`/organizations/${org.id}/team/${memberId}`, { method: "PATCH", body: "{}" });
      setToast(L("تمت إزالة العضو", "Member removed"));
      onChanged();
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="admin-content-grid" style={{ marginBottom: 24 }}>
      <div>
        <h2>{org.name}</h2>
        <p className="muted">
          {L("حالة المؤسسة", "Organization status")}: {org.status} ·{" "}
          {L("دورك", "Your role")}:{" "}
          {{ owner: L("مالك", "Owner"), admin: L("مسؤول", "Admin"), member: L("عضو", "Member") }[myRole] || myRole}
        </p>
        <div className="sessions-list">
          {active.length ? (
            active.map((m) => (
              <div className="session-row" key={m.id}>
                <div>
                  <strong>{m.User?.name}</strong>
                  <small>
                    @{m.User?.username} ·{" "}
                    {m.role === "admin" ? L("مسؤول", "Admin") : L("عضو", "Member")}
                  </small>
                </div>
                {isOwner && m.role !== "owner" && (
                  <button
                    className="button button-outline"
                    onClick={() => changeRole(m.id, m.role === "admin" ? "member" : "admin")}
                  >
                    {m.role === "admin" ? L("اجعله عضوًا", "Make member") : L("اجعله مسؤولًا", "Make admin")}
                  </button>
                )}
                {canManage && m.role !== "owner" && (isOwner || m.role !== "admin") && (
                  <button className="button button-outline" onClick={() => remove(m.id)}>
                    {L("إزالة", "Remove")}
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="muted">{L("لا يوجد أعضاء فريق بعد", "No team members yet")}</p>
          )}
        </div>
        {myRow && myRole !== "owner" && (
          <button className="button button-outline danger" onClick={leave}>
            {L("مغادرة الفريق", "Leave team")}
          </button>
        )}
        {canManage && org.status === "approved" && (
          <>
            <button className="button button-outline" onClick={() => setShowStats((x) => !x)}>
              <ChartNoAxesCombined size={16} />
              {showStats ? L("إخفاء الإحصاءات", "Hide analytics") : L("إحصاءات الفريق", "Team analytics")}
            </button>
            {showStats && <OrganizationAnalytics orgId={org.id} />}
          </>
        )}
      </div>
      {canManage && org.status === "approved" && (
        <form className="settings-form" onSubmit={add}>
          <h2>{L("إضافة عضو للفريق", "Add a team member")}</h2>
          <div className="form-columns">
            <label>
              {L("اسم المستخدم", "Username")}
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label>
              {L("الدور", "Role")}
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">{L("عضو", "Member")}</option>
                {isOwner && <option value="admin">{L("مسؤول", "Admin")}</option>}
              </select>
            </label>
          </div>
          <button className="button button-accent" disabled={busy}>
            {L("إضافة", "Add")}
            <Plus size={16} />
          </button>
        </form>
      )}
    </div>
  );
}
function PerksPage() {
  const { user, lang, setToast } = useApp();
  const [t, L] = useText();
  const [refresh, setRefresh] = useState(0),
    [view, setView] = useState("catalog"),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState({
      startupName: "",
      website: "",
      stage: "idea",
      useCase: "",
    });
  const catalog = useData("/perks", refresh),
    applications = useData("/my-perk-applications", refresh, !!user),
    access = catalog.data?.access;
  const visible = (catalog.data?.items || []).filter((item) => {
    const matchesFilter =
      filter === "all" ||
      item.providerGroup === filter ||
      item.category === filter;
    const haystack = [
      item.provider,
      item.product,
      item.titleAr,
      item.titleEn,
      item.summaryAr,
      item.summaryEn,
    ]
      .join(" ")
      .toLowerCase();
    return matchesFilter && haystack.includes(query.trim().toLowerCase());
  });
  const usd = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);
  const valueLabel = (item) =>
    item.valueMaxUsd
      ? item.valueMinUsd === item.valueMaxUsd
        ? usd(item.valueMaxUsd)
        : `${usd(item.valueMinUsd)}–${usd(item.valueMaxUsd)}`
      : L("تحددها الجهة", "Provider-defined");
  const statusLabel = (status) =>
    ({
      submitted: L("تم الاستلام", "Submitted"),
      reviewing: L("قيد المراجعة", "Under review"),
      info_requested: L("معلومات مطلوبة", "Information requested"),
      submitted_to_partner: L("أُرسل للجهة", "Submitted to provider"),
      approved: L("تمت الموافقة", "Approved"),
      rejected: L("غير مؤهل حاليًا", "Not eligible now"),
    })[status] || status;
  async function apply(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/perks/${selected.id}/apply`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setToast(
        L(
          "تم إرسال طلبك لفريق مزايا USAM",
          "Your application was sent to the USAM Perks team",
        ),
      );
      setSelected(null);
      setForm({ startupName: "", website: "", stage: "idea", useCase: "" });
      setRefresh((x) => x + 1);
      setView("applications");
    } catch (e) {
      setToast(
        e.message === "paid_membership_required"
          ? L("الميزة للأعضاء المدفوعين فقط", "Paid membership required")
          : e.message === "invalid_perk_application"
            ? L(
                "أكمل البيانات واشرح احتياجك بوضوح",
                "Complete the form and describe your need clearly",
              )
            : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="perks-page wrap perks-public-page">
      <section className="perks-hero">
        <div className="perks-hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" /> USAM MEMBER PERKS
          </span>
          <h1>
            {L(
              "قيمة أكبر من اشتراكك بكتير.",
              "More value than your membership costs.",
            )}
          </h1>
          <p>
            {L(
              "منح ورصيد منتجات من شركات USAM، مع دعم حقيقي للوصول إلى أشهر برامج الشركات الناشئة عالميًا—كل الطلبات من مكان واحد.",
              "Product grants from USAM companies, plus hands-on support for leading global startup programs—all from one place.",
            )}
          </p>
          <div className="perks-hero-actions">
            <button
              className="button button-accent"
              onClick={() => setView("catalog")}
            >
              {L("استكشف المزايا", "Explore perks")}
              <ArrowUpLeft size={17} />
            </button>
            <button
              className="button button-outline"
              onClick={() => setView("applications")}
            >
              {L("تابع طلباتك", "Track applications")}
            </button>
          </div>
        </div>
        <div className="perks-value-panel">
          <span>{L("مزايا شركات USAM", "USAM company benefits")}</span>
          <strong>$100–$1,000</strong>
          <p>
            {L(
              "في كل شركة، حسب الاحتياج والأهلية",
              "per company, based on need and eligibility",
            )}
          </p>
          <div className="perks-brand-row">
            {["USAM", "Flowly", "Wasl", "Rsmo"].map((name) => (
              <b key={name}>{name}</b>
            ))}
          </div>
          <small>
            <Shield size={15} />
            {L(
              "التقديم متاح للعضويات المدفوعة النشطة",
              "Applications require an active paid membership",
            )}
          </small>
        </div>
      </section>

      {!access?.eligible && !catalog.loading && (
        <section className="perks-access-banner">
          <div className="perks-lock-icon">
            <LockKeyhole size={24} />
          </div>
          <div>
            <span>{L("وصول حصري للأعضاء", "MEMBERS-ONLY ACCESS")}</span>
            <h2>
              {user
                ? L(
                    "الكتالوج مفتوح لك—والتقديم يبدأ مع خطة مدفوعة.",
                    "Explore everything—apply with an active paid plan.",
                  )
                : L(
                    "استكشف كل المزايا—وسجّل الدخول عندما تكون جاهزًا للتقديم.",
                    "Explore every perk—sign in when you are ready to apply.",
                  )}
            </h2>
            <p>
              {user
                ? L(
                    "فعّل Plus أو Pro أو Organization لتقديم طلباتك ومتابعتها من حسابك.",
                    "Activate Plus, Pro or Organization to submit and track applications.",
                  )
                : L(
                    "صفحة المزايا عامة، بينما التقديم والمتابعة متاحان للأعضاء أصحاب الخطط المدفوعة.",
                    "The catalog is public; applications and tracking are available to paid members.",
                  )}
            </p>
          </div>
          <Link className="button button-accent" to={user ? "/pricing" : "/login"}>
            {user ? L("قارن الخطط", "Compare plans") : L("سجّل الدخول", "Sign in")}
            <ArrowUpLeft size={17} />
          </Link>
        </section>
      )}

      <div className="perks-tabs" role="tablist">
        <button
          className={view === "catalog" ? "active" : ""}
          onClick={() => setView("catalog")}
        >
          {L("كتالوج المزايا", "Perks catalog")}
        </button>
        <button
          className={view === "applications" ? "active" : ""}
          onClick={() => setView("applications")}
        >
          {L("طلباتي", "My applications")}
          {!!applications.data?.items?.length && (
            <span>{applications.data.items.length}</span>
          )}
        </button>
      </div>

      {view === "catalog" ? (
        <>
          <div className="perks-toolbar">
            <div className="perks-filters">
              {[
                ["all", L("الكل", "All")],
                ["usam", L("شركات USAM", "USAM companies")],
                ["ecosystem", L("برامج عالمية", "Global programs")],
                ["cloud", "Cloud & AI"],
                ["growth", L("النمو", "Growth")],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? "active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="perks-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={L(
                  "ابحث باسم الشركة أو المنتج",
                  "Search company or product",
                )}
              />
            </label>
          </div>
          <Loadable loading={catalog.loading} error={catalog.error}>
            <div className="perks-grid">
              {visible.map((item) => (
                <article
                  className={`perk-card ${item.featured ? "featured" : ""}`}
                  key={item.id}
                >
                  <div className="perk-card-head">
                    <div className="perk-provider-mark">
                      {item.provider.charAt(0)}
                    </div>
                    <div>
                      <strong>{item.provider}</strong>
                      <span>{item.product}</span>
                    </div>
                    {item.featured && (
                      <span className="perk-featured">
                        {L("مختارة", "Featured")}
                      </span>
                    )}
                  </div>
                  <div className="perk-card-value">
                    <span>{L("قيمة محتملة", "Potential value")}</span>
                    <strong>{valueLabel(item)}</strong>
                  </div>
                  <h2>{lang === "ar" ? item.titleAr : item.titleEn}</h2>
                  <p>{lang === "ar" ? item.summaryAr : item.summaryEn}</p>
                  <div className="perk-meta-row">
                    <span className={`perk-source ${item.providerGroup}`}>
                      {item.providerGroup === "usam"
                        ? L("من شركات USAM", "USAM-owned benefit")
                        : L("دعم تقديم خارجي", "Assisted external program")}
                    </span>
                    <span>
                      {{
                        available: L("متاح", "Available"),
                        pilot: L("تجريبي", "Pilot"),
                        assisted: L("تقديم مدعوم", "Assisted"),
                        targeted: L("قائمة اهتمام", "Interest list"),
                      }[item.availability]}
                    </span>
                  </div>
                  <small className="perk-terms">
                    <Info size={15} />
                    {lang === "ar" ? item.termsAr : item.termsEn}
                  </small>
                  {item.application ? (
                    <div className="perk-application-state">
                      <CheckCircle2 size={17} />
                      {statusLabel(item.application.status)}
                    </div>
                  ) : access?.eligible ? (
                    <button
                      className="button button-dark perk-apply"
                      onClick={() => setSelected(item)}
                    >
                      {item.availability === "targeted"
                        ? L("سجّل اهتمامك", "Join interest list")
                        : L("قدّم من خلال USAM", "Apply through USAM")}
                      <ArrowUpLeft size={16} />
                    </button>
                  ) : (
                    <Link
                      className="button button-outline perk-apply"
                      to={user ? "/pricing" : "/login"}
                    >
                      <LockKeyhole size={16} />
                      {user
                        ? L("افتح التقديم", "Unlock applications")
                        : L("سجّل الدخول للتقديم", "Sign in to apply")}
                    </Link>
                  )}
                </article>
              ))}
            </div>
            {!visible.length && (
              <Empty
                icon={Gift}
                title={L("لا توجد نتائج مطابقة", "No matching perks")}
              />
            )}
          </Loadable>
        </>
      ) : (
        !user ? (
          <Empty
            icon={LockKeyhole}
            title={L("سجّل الدخول لمتابعة طلباتك", "Sign in to track applications")}
            body={L(
              "الكتالوج متاح للجميع، وسجل الطلبات محفوظ داخل حساب العضو.",
              "The catalog is public; application history stays in your member account.",
            )}
            action={L("سجّل الدخول", "Sign in")}
            href="/login"
          />
        ) : (
          <Loadable loading={applications.loading} error={applications.error}>
            {applications.data?.items?.length ? (
            <div className="perk-applications-list">
              {applications.data.items.map((item) => (
                <article key={item.id}>
                  <div className="perk-provider-mark">
                    {item.Perk?.provider?.charAt(0)}
                  </div>
                  <div>
                    <span>{item.Perk?.provider}</span>
                    <h2>
                      {lang === "ar" ? item.Perk?.titleAr : item.Perk?.titleEn}
                    </h2>
                    <small>
                      {new Date(item.createdAt).toLocaleDateString(
                        lang === "ar" ? "ar-EG" : "en-US",
                      )}
                    </small>
                  </div>
                  <span className={`status-pill ${item.status}`}>
                    {statusLabel(item.status)}
                  </span>
                </article>
              ))}
            </div>
            ) : (
              <Empty
                icon={Gift}
                title={L("لم تقدم على أي ميزة بعد", "No applications yet")}
                body={L(
                  "استكشف الكتالوج واختر الميزة الأنسب لمرحلتك.",
                  "Explore the catalog and choose the benefit that fits your stage.",
                )}
                action={L("استكشف المزايا", "Explore perks")}
                href="/perks"
              />
            )}
          </Loadable>
        )
      )}

      <section className="perks-process">
        {[
          [
            "01",
            L("اختر الميزة", "Choose a perk"),
            L(
              "قارن القيمة والشروط ومدى ملاءمتها لمرحلتك.",
              "Compare value, terms and stage fit.",
            ),
          ],
          [
            "02",
            L("قدّم مرة واحدة", "Apply once"),
            L(
              "شارك احتياجك بوضوح، وفريق USAM يراجع الملف.",
              "Explain your need; USAM reviews the file.",
            ),
          ],
          [
            "03",
            L("تابع من حسابك", "Track in your account"),
            L(
              "شاهد الحالة وأي معلومات مطلوبة من نفس الصفحة.",
              "See status and follow-up requests here.",
            ),
          ],
        ].map(([number, title, body]) => (
          <div key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </section>
      <p className="perks-disclosure">
        <Info size={17} />
        {L(
          "مزايا شركات USAM تخضع للمراجعة والنطاق المتاح. البرامج الخارجية تخضع بالكامل لشروط وموافقة الجهة المقدمة، ولا تمثل موافقة أو رصيدًا مضمونًا من USAM.",
          catalog.data?.disclosure ||
            "External programs remain subject to provider approval and terms.",
        )}
      </p>

      {selected && (
        <div
          className="perk-apply-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="perk-apply-title"
        >
          <button
            className="perk-panel-scrim"
            aria-label={L("إغلاق", "Close")}
            onClick={() => setSelected(null)}
          />
          <form onSubmit={apply}>
            <div className="perk-form-head">
              <div>
                <span>{selected.provider}</span>
                <h2 id="perk-apply-title">
                  {lang === "ar" ? selected.titleAr : selected.titleEn}
                </h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p>
              {L(
                "أرسل معلومات كافية للمراجعة. التقديم لا يعني الموافقة التلقائية.",
                "Provide enough detail for review. Submission does not mean automatic approval.",
              )}
            </p>
            <div className="form-columns">
              <label>
                {L("اسم المشروع أو المؤسسة", "Startup or organization name")}
                <input
                  required
                  minLength="2"
                  value={form.startupName}
                  onChange={(e) =>
                    setForm({ ...form, startupName: e.target.value })
                  }
                />
              </label>
              <label>
                {L("الموقع الإلكتروني", "Website")}
                <input
                  type="url"
                  dir="ltr"
                  value={form.website}
                  onChange={(e) =>
                    setForm({ ...form, website: e.target.value })
                  }
                  placeholder="https://"
                />
              </label>
            </div>
            <label>
              {L("المرحلة", "Stage")}
              <select
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value })}
              >
                <option value="idea">
                  {L("فكرة / ما قبل المنتج", "Idea / pre-product")}
                </option>
                <option value="mvp">MVP</option>
                <option value="early-revenue">
                  {L("إيرادات مبكرة", "Early revenue")}
                </option>
                <option value="growth">{L("نمو", "Growth")}</option>
                <option value="organization">
                  {L("مؤسسة", "Organization")}
                </option>
              </select>
            </label>
            <label>
              {L("كيف ستستخدم الميزة؟", "How will you use this benefit?")}
              <textarea
                required
                minLength="30"
                maxLength="2500"
                value={form.useCase}
                onChange={(e) => setForm({ ...form, useCase: e.target.value })}
                placeholder={L(
                  "اشرح الهدف، الاحتياج والنتيجة المتوقعة...",
                  "Explain the goal, need and expected outcome...",
                )}
              />
            </label>
            <label className="consent-row">
              <input required type="checkbox" />
              <span>
                {L(
                  "أؤكد صحة البيانات وأفهم أن القرار النهائي يخضع للمراجعة وشروط الجهة.",
                  "I confirm the information is accurate and understand approval remains subject to review and provider terms.",
                )}
              </span>
            </label>
            <button className="button button-accent" disabled={busy}>
              {busy ? t.loading : L("إرسال الطلب", "Submit application")}
              <ArrowUpLeft size={17} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
function AdminWorkflowPanel({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const groups = useData("/admin/groups", refresh),
    rooms = useData("/admin/curated-rooms", refresh),
    partnerships = useData("/admin/partnerships", refresh);
  async function patch(url, body) {
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(body) });
      setRefresh((x) => x + 1);
      setToast(L("تم حفظ القرار", "Decision saved"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="settings-form">
      <h2>{L("طلبات التشغيل الجديدة", "New workflow requests")}</h2>
      {groups.data?.items
        ?.flatMap((g) => g.GroupMemberships || [])
        .filter((m) => m.status === "pending")
        .map((m) => (
          <div className="admin-row" key={m.id}>
            <div>
              <strong>{m.User?.name}</strong>
              <p>{L("طلب انضمام لمجموعة خاصة", "Private group request")}</p>
            </div>
            <div>
              <button
                onClick={() =>
                  patch(`/admin/group-memberships/${m.id}`, {
                    status: "active",
                  })
                }
              >
                {L("قبول", "Approve")}
              </button>
              <button
                onClick={() =>
                  patch(`/admin/group-memberships/${m.id}`, {
                    status: "rejected",
                  })
                }
              >
                {L("رفض", "Reject")}
              </button>
            </div>
          </div>
        ))}
      {rooms.data?.items
        ?.flatMap((r) =>
          (r.RoomApplications || []).map((a) => ({ ...a, roomTitle: r.title })),
        )
        .filter((a) => a.status === "pending")
        .map((a) => (
          <div className="admin-row" key={a.id}>
            <div>
              <strong>
                {a.User?.name} · {a.roomTitle}
              </strong>
              <p>{a.motivation}</p>
            </div>
            <div>
              <button
                onClick={() =>
                  patch(`/admin/room-applications/${a.id}`, {
                    status: "accepted",
                  })
                }
              >
                {L("قبول", "Accept")}
              </button>
              <button
                onClick={() =>
                  patch(`/admin/room-applications/${a.id}`, {
                    status: "rejected",
                  })
                }
              >
                {L("رفض", "Reject")}
              </button>
            </div>
          </div>
        ))}
      <h3>{L("حضور الغرف (المقبولون)", "Room attendance (accepted)")}</h3>
      {rooms.data?.items
        ?.flatMap((r) =>
          (r.RoomApplications || []).map((a) => ({ ...a, roomTitle: r.title })),
        )
        .filter((a) => a.status === "accepted")
        .map((a) => (
          <div className="admin-row" key={a.id}>
            <div>
              <strong>
                {a.User?.name} · {a.roomTitle}
              </strong>
              <small>
                {a.checkedInAt
                  ? `${L("حضر", "Checked in")} · ${new Date(a.checkedInAt).toLocaleString()}`
                  : L("لم يُسجَّل الحضور", "Not checked in")}
                {a.rating ? ` · ${a.rating}/5` : ""}
              </small>
            </div>
            {!a.checkedInAt && (
              <button
                onClick={() =>
                  patch(`/admin/room-applications/${a.id}`, { action: "checkin" })
                }
              >
                {L("تسجيل حضور", "Check in")}
              </button>
            )}
          </div>
        ))}
      {partnerships.data?.items
        ?.filter((x) =>
          ["requested", "reviewing", "approved"].includes(x.status),
        )
        .map((x) => (
          <div className="admin-row" key={x.id}>
            <div>
              <strong>{x.organizationName}</strong>
              <p>{x.objective}</p>
              <small>{x.status}</small>
            </div>
            <button
              onClick={() =>
                patch(`/admin/partnerships/${x.id}`, {
                  status:
                    x.status === "requested"
                      ? "reviewing"
                      : x.status === "reviewing"
                        ? "approved"
                        : "active",
                })
              }
            >
              {L("نقل للمرحلة التالية", "Move to next stage")}
            </button>
          </div>
        ))}
    </div>
  );
}
// Catalog controls: publish/archive a perk, pause it, or feature it.
// Admin analytics (wires GET /admin/analytics). Real counts over a rolling
// window; the CSV export is generated in the browser from the same response.
function AdminAnalyticsPanel() {
  const [, L] = useText();
  const { lang } = useApp();
  const [days, setDays] = useState(30);
  const { data, loading, error } = useData(`/admin/analytics?days=${days}`);
  const Bars = ({ series, money }) => {
    const max = Math.max(1, ...series.map((d) => d.value));
    return (
      <div className="analytics-bars" role="img" aria-label={series.map((d) => `${d.day}: ${d.value}`).join(", ")}>
        {series.map((d) => (
          <span key={d.day} title={`${d.day}: ${money ? formatEgp(d.value, lang) : d.value}`} style={{ blockSize: `${Math.max(2, (d.value / max) * 100)}%` }} />
        ))}
      </div>
    );
  };
  const Seg = ({ title, map, label = (k) => k }) => {
    const total = Object.values(map).reduce((a, b) => a + b, 0) || 1;
    return (
      <div className="analytics-segment">
        <h3>{title}</h3>
        {Object.entries(map)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => (
            <div key={k} className="analytics-seg-row">
              <span>{label(k)}</span>
              <span className="analytics-seg-bar"><i style={{ inlineSize: `${(v / total) * 100}%` }} /></span>
              <b>{v}</b>
            </div>
          ))}
      </div>
    );
  };
  function exportCsv() {
    const rows = [["day", "new_members", "posts", "net_revenue_egp"]];
    data.growth.newMembersByDay.forEach((d, i) =>
      rows.push([d.day, d.value, data.engagement.postsByDay[i].value, data.revenue.netByDay[i].value]),
    );
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `usam-analytics-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const community = (s) => personaData.find((p) => p.slug === s)?.name || s;
  return (
    <div className="settings-form analytics-panel">
      <div className="analytics-head">
        <h2>{L("التحليلات", "Analytics")}</h2>
        <div className="feed-filters">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" className={days === d ? "active" : ""} onClick={() => setDays(d)}>
              {L(`${d} يومًا`, `${d} days`)}
            </button>
          ))}
          {data && (
            <button type="button" onClick={exportCsv}>
              {L("تصدير CSV", "Export CSV")}
            </button>
          )}
        </div>
      </div>
      <Loadable loading={loading} error={error}>
        {data && (
          <>
            <div className="stat-grid">
              {[
                [data.growth.totalMembers, L("إجمالي الأعضاء", "Total members"), Users],
                [data.growth.newMembers, L("أعضاء جدد", "New members"), Plus],
                [data.engagement.activeMembers, L("أعضاء نشطون", "Active members"), UserRound],
                [formatEgp(data.revenue.netEgp, lang), L("صافي الإيرادات", "Net revenue"), CreditCard],
                [data.revenue.payingMembers, L("أعضاء دافعون", "Paying members"), BadgeCheck],
                [formatEgp(data.revenue.couponDiscountEgp, lang), L("خصومات الأكواد", "Promo discounts"), Gift],
              ].map(([v, label, Icon]) => (
                <div className="stat-card" key={label}>
                  <Icon size={20} />
                  <strong>{v}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="analytics-charts">
              <div>
                <h3>{L("أعضاء جدد يوميًا", "New members per day")}</h3>
                <Bars series={data.growth.newMembersByDay} />
              </div>
              <div>
                <h3>{L("صافي الإيرادات يوميًا", "Net revenue per day")}</h3>
                <Bars series={data.revenue.netByDay} money />
              </div>
              <div>
                <h3>{L("المنشورات يوميًا", "Posts per day")}</h3>
                <Bars series={data.engagement.postsByDay} />
              </div>
            </div>
            <p className="muted">
              {L("الاشتراكات", "Plans")} {formatEgp(data.revenue.plansEgp, lang)} · {L("الفعاليات", "Events")}{" "}
              {formatEgp(data.revenue.eventsEgp, lang)} · {L("مستردات", "Refunds")} {formatEgp(data.revenue.refundsEgp, lang)} ·{" "}
              {L("تعليقات", "Comments")} {data.engagement.comments} · {L("رسائل", "Messages")} {data.engagement.messages} ·{" "}
              {L("تسجيلات فعاليات", "Event registrations")} {data.engagement.eventRegistrations} · {L("حضور", "Check-ins")}{" "}
              {data.engagement.eventCheckIns}
            </p>
            <h3>{L("مسار التحويل", "Conversion funnel")}</h3>
            <div className="analytics-funnel">
              {[
                [L("سجّلوا", "Signed up"), data.funnel.signedUp],
                [L("وثّقوا البريد", "Verified email"), data.funnel.verified],
                [L("انضموا لمجتمع", "Joined a community"), data.funnel.joinedCommunity],
                [L("نشروا", "Posted"), data.funnel.posted],
                [L("دفعوا", "Paid"), data.funnel.paid],
              ].map(([label, v]) => (
                <div key={label}>
                  <strong>{v}</strong>
                  <span>{label}</span>
                  <small>{data.funnel.signedUp ? Math.round((v / data.funnel.signedUp) * 100) : 0}%</small>
                </div>
              ))}
            </div>
            <div className="analytics-segments">
              <Seg title={L("حسب المجتمع", "By community")} map={data.segments.byCommunity} label={community} />
              <Seg title={L("حسب الخطة", "By plan")} map={data.segments.byPlan} label={(k) => (k === "none" ? L("بدون خطة", "No plan") : k)} />
              <Seg title={L("حسب المسار", "By persona")} map={data.segments.byPersona} label={community} />
              <Seg title={L("حسب الدور", "By role")} map={data.segments.byRole} />
            </div>
          </>
        )}
      </Loadable>
    </div>
  );
}
// Admin: promo codes (wires /admin/coupons). Usage numbers are live from the
// server: "uses" counts confirmed redemptions plus checkouts still open.
function AdminCouponsPanel() {
  const [, L] = useText();
  const { setToast, lang } = useApp();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData("/admin/coupons", refresh);
  const plans = useData("/admin/plans").data?.items || [];
  const blank = {
    code: "", description: "", discountType: "percent", value: "", appliesTo: "any",
    planCodes: [], billingCycle: "any", maxRedemptions: "", perUserLimit: 1, expiresAt: "",
  };
  const [form, setForm] = useState(blank);
  const [openId, setOpenId] = useState(null);
  const reds = useData(openId ? `/admin/coupons/${openId}/redemptions` : null, refresh);
  const fieldText = (f) =>
    ({
      code: L("الكود: ٣-٤٠ حرفًا لاتينيًا أو رقمًا", "Code: 3-40 letters, digits, - or _"),
      value: L("القيمة: نسبة ١-١٠٠ أو مبلغ صحيح", "Value: 1-100 % or a whole EGP amount"),
      expiresAt: L("تاريخ الانتهاء يجب أن يكون بعد البداية", "Expiry must be after the start"),
    })[f] || f;
  async function create(e) {
    e.preventDefault();
    try {
      await api("/admin/coupons", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          value: Number(form.value),
          maxRedemptions: form.maxRedemptions === "" ? null : Number(form.maxRedemptions),
          perUserLimit: Number(form.perUserLimit),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        }),
      });
      setForm(blank);
      setRefresh((x) => x + 1);
      setToast(L("تم إنشاء الكود", "Promo code created"));
    } catch (err) {
      setToast(err.message === "coupon_code_taken" ? L("الكود مستخدم بالفعل", "That code already exists") : L("راجع الحقول", "Check the fields"));
    }
  }
  async function patch(c, body, done) {
    try {
      await api(`/admin/coupons/${c.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setRefresh((x) => x + 1);
      setToast(done);
    } catch (err) {
      setToast(err.message);
    }
  }
  const describe = (c) =>
    `${c.discountType === "percent" ? `${c.value}%` : formatEgp(c.value, lang)} · ${
      { any: L("الكل", "everything"), subscription: L("الاشتراكات", "plans"), event: L("الفعاليات", "events") }[c.appliesTo]
    }${c.planCodes.length ? ` (${c.planCodes.join(", ")})` : ""}${c.billingCycle !== "any" ? ` · ${c.billingCycle}` : ""}`;
  return (
    <div className="admin-content-grid">
      <form className="settings-form" onSubmit={create}>
        <h2>{L("كود خصم جديد", "New promo code")}</h2>
        <div className="form-columns">
          <label>
            {L("الكود", "Code")}
            <input dir="ltr" required maxLength="40" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </label>
          <label>
            {L("الوصف", "Description")}
            <input maxLength="240" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
        </div>
        <div className="form-columns">
          <label>
            {L("نوع الخصم", "Discount type")}
            <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
              <option value="percent">{L("نسبة مئوية", "Percent")}</option>
              <option value="fixed">{L("مبلغ ثابت (ج.م)", "Fixed amount (EGP)")}</option>
            </select>
          </label>
          <label>
            {L("القيمة", "Value")}
            <input type="number" min="1" max={form.discountType === "percent" ? 100 : 100000} required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
        </div>
        <div className="form-columns">
          <label>
            {L("ينطبق على", "Applies to")}
            <select value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}>
              <option value="any">{L("الاشتراكات والفعاليات", "Plans and events")}</option>
              <option value="subscription">{L("الاشتراكات فقط", "Plans only")}</option>
              <option value="event">{L("تذاكر الفعاليات فقط", "Event tickets only")}</option>
            </select>
          </label>
          <label>
            {L("دورة الفوترة", "Billing cycle")}
            <select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
              <option value="any">{L("أي دورة", "Any")}</option>
              <option value="monthly">{L("شهري", "Monthly")}</option>
              <option value="yearly">{L("سنوي", "Yearly")}</option>
            </select>
          </label>
        </div>
        {form.appliesTo !== "event" && (
          <fieldset className="coupon-plans">
            <legend>{L("الخطط (اتركها فارغة لكل الخطط المدفوعة)", "Plans (leave empty for every paid plan)")}</legend>
            {plans.filter((p) => p.monthlyEgp > 0).map((p) => (
              <label key={p.code} className="check-row">
                <input
                  type="checkbox"
                  checked={form.planCodes.includes(p.code)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      planCodes: e.target.checked ? [...form.planCodes, p.code] : form.planCodes.filter((x) => x !== p.code),
                    })
                  }
                />
                {lang === "ar" ? p.nameAr : p.nameEn}
              </label>
            ))}
          </fieldset>
        )}
        <div className="form-columns">
          <label>
            {L("الحد الأقصى للاستخدام", "Total uses limit")}
            <input type="number" min="1" placeholder={L("بلا حد", "Unlimited")} value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} />
          </label>
          <label>
            {L("لكل عضو", "Per member")}
            <input type="number" min="1" required value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} />
          </label>
        </div>
        <label>
          {L("ينتهي في", "Expires at")}
          <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </label>
        <button className="button button-accent">
          {L("إنشاء الكود", "Create code")}
          <Plus size={16} />
        </button>
      </form>
      <div className="settings-form">
        <h2>{L("أكواد الخصم", "Promo codes")}</h2>
        <Loadable loading={loading} error={error}>
          {data?.items?.length ? (
            data.items.map((c) => (
              <div className="admin-row coupon-row-admin" key={c.id}>
                <div>
                  <strong dir="ltr">{c.code}</strong>{" "}
                  <span className={`status-pill ${c.active ? "active" : "canceled"}`}>
                    {c.active ? L("مفعّل", "Active") : L("موقوف", "Paused")}
                  </span>
                  <p>{c.description}</p>
                  <small>
                    {describe(c)} · {L("الاستخدام", "Uses")} {c.uses}
                    {c.maxRedemptions ? `/${c.maxRedemptions}` : ""} · {L("مؤكد", "redeemed")} {c.redeemed} ·{" "}
                    {L("إجمالي الخصم", "discount given")} {formatEgp(c.discountGivenEgp, lang)}
                    {c.expiresAt ? ` · ${L("ينتهي", "expires")} ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
                  </small>
                </div>
                <div className="admin-perk-actions">
                  <button onClick={() => patch(c, { active: !c.active }, c.active ? L("تم الإيقاف", "Paused") : L("تم التفعيل", "Activated"))}>
                    {c.active ? L("إيقاف", "Pause") : L("تفعيل", "Activate")}
                  </button>
                  <button onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                    {openId === c.id ? L("إخفاء", "Hide") : L("الاستخدامات", "Redemptions")}
                  </button>
                </div>
                {openId === c.id && (
                  <div className="coupon-redemptions">
                    {reds.data?.items?.length ? (
                      reds.data.items.map((r) => (
                        <small key={r.id}>
                          {r.member?.name} ({r.member?.email}) · {r.target} · {formatEgp(r.originalEgp, lang)} → {formatEgp(r.finalEgp, lang)} ·{" "}
                          {{ redeemed: L("مؤكد", "redeemed"), reserved: L("بانتظار الدفع", "awaiting payment"), released: L("أُلغي", "released") }[r.status]} ·{" "}
                          {new Date(r.createdAt).toLocaleString()}
                        </small>
                      ))
                    ) : (
                      <small className="muted">{L("لم يُستخدم بعد", "Not used yet")}</small>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="muted">{L("لا توجد أكواد بعد", "No promo codes yet")}</p>
          )}
        </Loadable>
      </div>
    </div>
  );
}
// Admin: every event with seats, revenue and a cancel action (wires
// GET /admin/events and PATCH /admin/events/:id).
function AdminEventsList({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast, lang } = useApp();
  const { data, loading, error } = useData("/admin/events", refresh);
  async function cancel(ev) {
    const msg =
      ev.priceType === "paid"
        ? L(
            "إلغاء الفعالية واسترداد كل التذاكر المدفوعة؟",
            "Cancel this event and refund every paid ticket?",
          )
        : L("إلغاء الفعالية وإبلاغ المسجلين؟", "Cancel this event and notify registrants?");
    if (!window.confirm(msg)) return;
    try {
      const r = await api(`/admin/events/${ev.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      const failed = (r.refunds || []).filter((x) => !x.ok).length;
      setToast(
        failed
          ? L(`أُلغيت الفعالية؛ فشل استرداد ${failed} تذكرة — راجع المدفوعات`, `Event cancelled; ${failed} refund(s) failed — check Payments`)
          : L("أُلغيت الفعالية", "Event cancelled"),
      );
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="settings-form">
      <h2>{L("الفعاليات", "Events")}</h2>
      <Loadable loading={loading} error={error}>
        {data?.items?.length ? (
          data.items.map((ev) => (
            <div className="admin-row" key={ev.id}>
              <div>
                <strong>{ev.title}</strong>
                <small>
                  {new Date(ev.startsAt).toLocaleString()} · {ev.status} ·{" "}
                  {ev.registeredCount}/{ev.capacity} {L("مقعد", "seats")}
                  {ev.waitlistCount ? ` · ${ev.waitlistCount} ${L("انتظار", "waitlisted")}` : ""}
                  {ev.priceType === "paid"
                    ? ` · ${formatEgp(ev.priceEgp, lang)} · ${L("صافي", "net")} ${formatEgp(ev.netRevenueEgp, lang)}`
                    : ` · ${L("مجانية", "free")}`}
                </small>
              </div>
              {ev.status === "published" && (
                <button className="button button-outline danger" onClick={() => cancel(ev)}>
                  {L("إلغاء الفعالية", "Cancel event")}
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="muted">{L("لا توجد فعاليات بعد", "No events yet")}</p>
        )}
      </Loadable>
    </div>
  );
}
function AdminPerkCatalog({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast, lang } = useApp();
  const perks = useData("/admin/perks", refresh);
  async function update(id, patch) {
    try {
      await api(`/admin/perks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setRefresh((x) => x + 1);
      setToast(L("تم تحديث الميزة", "Perk updated"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <Loadable loading={perks.loading} error={perks.error}>
      <div className="settings-form">
        <h2>{L("كتالوج المزايا", "Perk catalog")}</h2>
        {perks.data?.items?.map((p) => (
          <div className="admin-row" key={p.id}>
            <div>
              <strong>{p.provider} · {lang === "ar" ? p.titleAr : p.titleEn}</strong>
              <small>{p.slug}</small>
            </div>
            <div className="admin-perk-actions">
              <select value={p.status} onChange={(e) => update(p.id, { status: e.target.value })} aria-label="status">
                {["draft", "published", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={p.availability} onChange={(e) => update(p.id, { availability: e.target.value })} aria-label="availability">
                {["available", "pilot", "assisted", "targeted", "paused"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="toggle-inline">
                <input type="checkbox" checked={!!p.featured} onChange={(e) => update(p.id, { featured: e.target.checked })} />
                {L("مميزة", "Featured")}
              </label>
            </div>
          </div>
        ))}
      </div>
    </Loadable>
  );
}
function AdminPerksPanel({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const applications = useData("/admin/perk-applications", refresh);
  async function move(id, status) {
    try {
      await api(`/admin/perk-applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setRefresh((x) => x + 1);
      setToast(L("تم تحديث طلب الميزة", "Perk application updated"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <Loadable loading={applications.loading} error={applications.error}>
      <div className="settings-form admin-perks-panel">
        <h2>{L("طلبات مزايا الأعضاء", "Member perk applications")}</h2>
        {applications.data?.items?.length ? (
          applications.data.items.map((item) => (
            <div className="admin-row" key={item.id}>
              <div>
                <strong>
                  {item.User?.name} · {item.Perk?.provider}
                </strong>
                <p>
                  {item.startupName} — {item.useCase}
                </p>
                <small>
                  {item.User?.email} · {item.status}
                </small>
              </div>
              <div className="admin-perk-actions">
                {item.status === "submitted" && (
                  <button onClick={() => move(item.id, "reviewing")}>
                    {L("ابدأ المراجعة", "Start review")}
                  </button>
                )}
                {["submitted", "reviewing"].includes(item.status) && (
                  <button onClick={() => move(item.id, "info_requested")}>
                    {L("اطلب معلومات", "Request info")}
                  </button>
                )}
                {item.status === "reviewing" && (
                  <button
                    onClick={() =>
                      move(
                        item.id,
                        item.Perk?.providerGroup === "ecosystem"
                          ? "submitted_to_partner"
                          : "approved",
                      )
                    }
                  >
                    {item.Perk?.providerGroup === "ecosystem"
                      ? L("أرسل للجهة", "Submit to provider")
                      : L("موافقة", "Approve")}
                  </button>
                )}
                {item.status === "submitted_to_partner" && (
                  <button onClick={() => move(item.id, "approved")}>
                    {L("تأكيد الموافقة", "Confirm approval")}
                  </button>
                )}
                {!['approved', 'rejected'].includes(item.status) && (
                  <button onClick={() => move(item.id, "rejected")}>
                    {L("رفض", "Reject")}
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty
            icon={Gift}
            title={L("لا توجد طلبات مزايا", "No perk applications")}
          />
        )}
      </div>
    </Loadable>
  );
}
// --- Admin: event ticket check-in (wires POST /admin/events/check-in) -----
function AdminCheckInPanel() {
  const [, L] = useText();
  const { setToast } = useApp();
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api("/admin/events/check-in", {
        method: "POST",
        body: JSON.stringify({ ticketCode: code.trim() }),
      });
      setResult(r);
      setCode("");
    } catch (e) {
      setToast(
        e.message === "ticket_not_found"
          ? L("رمز التذكرة غير صحيح", "Ticket code not found")
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="settings-form" onSubmit={submit}>
      <h2>{L("تسجيل حضور الفعاليات", "Event ticket check-in")}</h2>
      <p className="muted">
        {L(
          "أدخل رمز التذكرة الذي يعرضه العضو لتسجيل حضوره.",
          "Enter the ticket code the member presents to check them in.",
        )}
      </p>
      <label>
        {L("رمز التذكرة", "Ticket code")}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          minLength="4"
        />
      </label>
      <button className="button button-accent" disabled={busy}>
        {L("تسجيل الحضور", "Check in")}
        <BadgeCheck size={17} />
      </button>
      {result && (
        <div className="billing-alert" style={{ marginTop: 16 }}>
          <CheckCircle2 size={18} />
          <p>
            {result.alreadyCheckedIn
              ? L("تم تسجيل الحضور مسبقًا", "Already checked in")
              : L("تم تسجيل الحضور بنجاح", "Checked in successfully")}
            {result.member ? ` — ${result.member}` : ""}
            {result.event ? ` · ${result.event}` : ""}
          </p>
        </div>
      )}
    </form>
  );
}
// --- Admin: create groups & curated rooms (wires POST /admin/groups, /admin/curated-rooms) ---
function AdminContentPanel({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const groups = useData("/admin/groups", refresh);
  const rooms = useData("/admin/curated-rooms", refresh);
  const [group, setGroup] = useState({
    slug: "",
    nameAr: "",
    nameEn: "",
    type: "group",
    visibility: "public",
    community: "launchpad",
    description: "",
  });
  const [room, setRoom] = useState({
    title: "",
    description: "",
    community: "launchpad",
    capacity: 12,
  });
  async function createGroup(e) {
    e.preventDefault();
    try {
      await api("/admin/groups", {
        method: "POST",
        body: JSON.stringify({ ...group, status: "published" }),
      });
      setRefresh((x) => x + 1);
      setGroup({ ...group, slug: "", nameAr: "", nameEn: "", description: "" });
      setToast(L("تم إنشاء المجموعة", "Group created"));
    } catch (e) {
      setToast(e.message);
    }
  }
  async function createRoom(e) {
    e.preventDefault();
    try {
      await api("/admin/curated-rooms", {
        method: "POST",
        body: JSON.stringify({ ...room, status: "open" }),
      });
      setRefresh((x) => x + 1);
      setRoom({ ...room, title: "", description: "" });
      setToast(L("تم إنشاء الغرفة", "Room created"));
    } catch (e) {
      setToast(e.message);
    }
  }
  const communityOptions = personaData.map((p) => (
    <option value={p.slug} key={p.slug}>
      {p.name}
    </option>
  ));
  return (
    <div className="admin-content-grid">
      <form className="settings-form" onSubmit={createGroup}>
        <h2>{L("إنشاء مجموعة/شابتر", "Create group / chapter")}</h2>
        <div className="form-columns">
          <label>
            {L("المعرّف (slug)", "Slug")}
            <input
              value={group.slug}
              required
              onChange={(e) => setGroup({ ...group, slug: e.target.value })}
            />
          </label>
          <label>
            {L("النوع", "Type")}
            <select
              value={group.type}
              onChange={(e) => setGroup({ ...group, type: e.target.value })}
            >
              <option value="group">{L("مجموعة", "Group")}</option>
              <option value="chapter">{L("شابتر", "Chapter")}</option>
            </select>
          </label>
        </div>
        <div className="form-columns">
          <label>
            {L("الاسم بالعربية", "Name (Arabic)")}
            <input
              value={group.nameAr}
              required
              onChange={(e) => setGroup({ ...group, nameAr: e.target.value })}
            />
          </label>
          <label>
            {L("الاسم بالإنجليزية", "Name (English)")}
            <input
              value={group.nameEn}
              required
              onChange={(e) => setGroup({ ...group, nameEn: e.target.value })}
            />
          </label>
        </div>
        <div className="form-columns">
          <label>
            {L("المجتمع", "Community")}
            <select
              value={group.community}
              onChange={(e) => setGroup({ ...group, community: e.target.value })}
            >
              {communityOptions}
            </select>
          </label>
          <label>
            {L("الظهور", "Visibility")}
            <select
              value={group.visibility}
              onChange={(e) =>
                setGroup({ ...group, visibility: e.target.value })
              }
            >
              <option value="public">{L("عام", "Public")}</option>
              <option value="private">{L("خاص", "Private")}</option>
            </select>
          </label>
        </div>
        <label>
          {L("الوصف", "Description")}
          <textarea
            value={group.description}
            onChange={(e) =>
              setGroup({ ...group, description: e.target.value })
            }
          />
        </label>
        <button className="button button-accent">
          {L("إنشاء المجموعة", "Create group")}
          <Plus size={16} />
        </button>
        <small className="muted">
          {L(
            `${groups.data?.items?.length || 0} مجموعة موجودة`,
            `${groups.data?.items?.length || 0} groups exist`,
          )}
        </small>
      </form>
      <form className="settings-form" onSubmit={createRoom}>
        <h2>{L("إنشاء غرفة منسقة", "Create curated room")}</h2>
        <label>
          {L("العنوان", "Title")}
          <input
            value={room.title}
            required
            onChange={(e) => setRoom({ ...room, title: e.target.value })}
          />
        </label>
        <label>
          {L("الوصف", "Description")}
          <textarea
            value={room.description}
            onChange={(e) => setRoom({ ...room, description: e.target.value })}
          />
        </label>
        <div className="form-columns">
          <label>
            {L("المجتمع", "Community")}
            <select
              value={room.community}
              onChange={(e) => setRoom({ ...room, community: e.target.value })}
            >
              {communityOptions}
            </select>
          </label>
          <label>
            {L("السعة", "Capacity")}
            <input
              type="number"
              min="1"
              max="100"
              value={room.capacity}
              onChange={(e) =>
                setRoom({ ...room, capacity: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <button className="button button-accent">
          {L("إنشاء الغرفة", "Create room")}
          <Plus size={16} />
        </button>
        <small className="muted">
          {L(
            `${rooms.data?.items?.length || 0} غرفة موجودة`,
            `${rooms.data?.items?.length || 0} rooms exist`,
          )}
        </small>
      </form>
    </div>
  );
}
// --- Admin: dynamic plan management (wires /admin/plans) ------------------
function AdminPlansPanel({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const plans = useData("/admin/plans", refresh);
  async function updatePlan(id, patch) {
    try {
      await api(`/admin/plans/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setRefresh((x) => x + 1);
      setToast(L("تم تحديث الخطة", "Plan updated"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <Loadable loading={plans.loading} error={plans.error}>
      <div className="settings-form">
        <h2>{L("إدارة الخطط والأسعار", "Plans & pricing")}</h2>
        <p className="muted">
          {L(
            "الأسعار والمزايا مخزّنة في قاعدة البيانات ويمكن تعديلها دون تغيير الكود.",
            "Prices and benefits are stored in the database and editable without code changes.",
          )}
        </p>
        {plans.data?.items?.map((p) => (
          <div className="admin-plan-row" key={p.id}>
            <div className="admin-plan-head">
              <strong>
                {p.nameEn} <span className="muted">({p.code})</span>
              </strong>
              <label className="toggle-inline">
                <input
                  type="checkbox"
                  checked={p.active}
                  onChange={(e) =>
                    updatePlan(p.id, { active: e.target.checked })
                  }
                />
                {L("نشطة", "Active")}
              </label>
            </div>
            <div className="form-columns">
              <label>
                {L("شهري (ج.م)", "Monthly (EGP)")}
                <input
                  type="number"
                  min="0"
                  defaultValue={p.monthlyEgp}
                  onBlur={(e) =>
                    Number(e.target.value) !== p.monthlyEgp &&
                    updatePlan(p.id, { monthlyEgp: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {L("سنوي (ج.م)", "Yearly (EGP)")}
                <input
                  type="number"
                  min="0"
                  defaultValue={p.yearlyEgp}
                  onBlur={(e) =>
                    Number(e.target.value) !== p.yearlyEgp &&
                    updatePlan(p.id, { yearlyEgp: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </Loadable>
  );
}
// --- Admin: payment ledger, refunds, reconciliation ------------------------
function AdminPaymentsPanel() {
  const [, L] = useText();
  const { setToast, lang } = useApp();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData(
    `/admin/payments?page=${page}${status ? `&status=${status}` : ""}`,
    refresh,
  );
  async function refund(p) {
    const raw = window.prompt(
      L("مبلغ الاسترداد (ج.م)", "Refund amount (EGP)"),
      String(p.amountEgp - p.refundedAmountEgp),
    );
    if (!raw) return;
    try {
      const r = await api(`/admin/payments/${p.id}/refund`, {
        method: "POST",
        body: JSON.stringify({ amountEgp: Number(raw) }),
      });
      setToast(
        r.providerConfirmed
          ? L("تم الاسترداد عبر Paymob", "Refunded via Paymob")
          : L("سُجّل الاسترداد محليًا (لا توجد عملية Paymob)", "Recorded locally (no Paymob charge)"),
      );
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(e.message);
    }
  }
  async function reconcile(p) {
    try {
      const r = await api(`/admin/payments/${p.id}/reconcile`, { method: "POST" });
      setToast(
        r.configured === false
          ? L("Paymob غير مفعّل", "Paymob is not configured")
          : r.found
            ? L("تمت المطابقة", "Reconciled")
            : L("لا توجد عملية لدى Paymob", "No provider transaction found"),
      );
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="settings-form">
      <h2>{L("المدفوعات", "Payments")}</h2>
      <label>
        {L("الحالة", "Status")}
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{L("الكل", "All")}</option>
          {["pending", "paid", "failed", "refunded", "canceled"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <Loadable loading={loading} error={error}>
        {data?.items?.map((p) => (
          <div className="admin-row" key={p.id}>
            <div>
              <strong>
                {p.user?.name} · {p.plan?.nameEn} · {formatEgp(p.amountEgp, lang)}
              </strong>
              <p>{p.user?.email}</p>
              <small>
                {p.status}
                {p.failureCode ? ` · ${p.failureCode}` : ""}
                {p.refundedAmountEgp ? ` · refunded ${p.refundedAmountEgp}` : ""} ·{" "}
                {new Date(p.createdAt).toLocaleString()}
              </small>
            </div>
            <div className="admin-perk-actions">
              {p.status === "paid" && (
                <button onClick={() => refund(p)}>{L("استرداد", "Refund")}</button>
              )}
              {["pending", "failed"].includes(p.status) && p.merchantOrderId && (
                <button onClick={() => reconcile(p)}>{L("مطابقة", "Reconcile")}</button>
              )}
            </div>
          </div>
        ))}
        {data?.items?.length === 0 && <p className="muted">{L("لا توجد مدفوعات", "No payments")}</p>}
        {data?.totalPages > 1 && (
          <div className="pagination-row">
            <button className="button button-outline" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>{L("السابق", "Prev")}</button>
            <span>{page} / {data.totalPages}</span>
            <button className="button button-outline" disabled={page >= data.totalPages} onClick={() => setPage((x) => x + 1)}>{L("التالي", "Next")}</button>
          </div>
        )}
      </Loadable>
    </div>
  );
}
// --- Admin: user management (wires /admin/users) --------------------------
function AdminUsersPanel({ currentUser }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [submitted]);
  const { data, loading, error } = useData(
    `/admin/users?q=${encodeURIComponent(submitted)}&page=${page}`,
    refresh,
  );
  async function act(id, body) {
    try {
      await api(`/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setRefresh((x) => x + 1);
      setToast(L("تم الحفظ", "Saved"));
    } catch (e) {
      setToast(
        e.message === "super_admin_required"
          ? L("يتطلب صلاحية super admin", "Requires super admin")
          : e.message,
      );
    }
  }
  return (
    <div className="settings-form">
      <h2>{L("إدارة المستخدمين", "User management")}</h2>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q);
        }}
      >
        <input
          placeholder={L("ابحث بالاسم أو البريد", "Search name or email")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="button button-accent">{L("بحث", "Search")}</button>
      </form>
      <Loadable loading={loading} error={error}>
        {data?.items?.map((u) => (
          <div className="admin-row" key={u.id}>
            <div>
              <strong>
                {u.name} <span className="muted">@{u.username}</span>
              </strong>
              <p>{u.email}</p>
              <small>
                {u.role} · {u.status}
                {u.emailVerified ? " · verified" : " · unverified"}
              </small>
            </div>
            <div className="admin-perk-actions">
              {u.status === "active" ? (
                <button
                  onClick={() =>
                    act(u.id, {
                      action: "suspend",
                      reason: window.prompt(L("سبب الإيقاف", "Suspension reason")) || "",
                    })
                  }
                  disabled={u.id === currentUser.id}
                >
                  {L("إيقاف", "Suspend")}
                </button>
              ) : u.status === "suspended" ? (
                <button onClick={() => act(u.id, { action: "reinstate" })}>
                  {L("إعادة تفعيل", "Reinstate")}
                </button>
              ) : null}
              {currentUser.role === "super_admin" && u.id !== currentUser.id && (
                <select
                  value={u.role}
                  onChange={(e) =>
                    act(u.id, { action: "set_role", role: e.target.value })
                  }
                >
                  <option value="member">member</option>
                  <option value="moderator">moderator</option>
                  <option value="admin">admin</option>
                  <option value="super_admin">super_admin</option>
                </select>
              )}
            </div>
          </div>
        ))}
        {data && (
          <div className="pagination-row">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {L("السابق", "Prev")}
            </button>
            <small className="muted">
              {L(
                `${data.total} مستخدم · صفحة ${data.page}/${Math.max(1, data.totalPages)}`,
                `${data.total} users · page ${data.page}/${Math.max(1, data.totalPages)}`,
              )}
            </small>
            <button
              type="button"
              disabled={page >= (data.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              {L("التالي", "Next")}
            </button>
          </div>
        )}
      </Loadable>
    </div>
  );
}
// --- Admin: feature flags (wires /admin/feature-flags) --------------------
function AdminFlagsPanel({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const flags = useData("/admin/feature-flags", refresh);
  async function toggle(flag) {
    try {
      await api(`/admin/feature-flags/${flag.key}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: !flag.enabled,
          description: flag.description,
        }),
      });
      setRefresh((x) => x + 1);
      setToast(L("تم تحديث الميزة", "Feature flag updated"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <Loadable loading={flags.loading} error={flags.error}>
      <div className="settings-form">
        <h2>{L("مفاتيح الميزات", "Feature flags")}</h2>
        {flags.data?.items?.map((f) => (
          <label className="toggle-row" key={f.key}>
            <input
              type="checkbox"
              checked={f.enabled}
              onChange={() => toggle(f)}
            />
            <span>
              <strong>{f.key}</strong>
              <small>{f.description || L("بدون وصف", "No description")}</small>
            </span>
          </label>
        ))}
      </div>
    </Loadable>
  );
}
// --- Admin: CMS editor (wires /admin/cms) ---------------------------------
function AdminCmsPanel({ refresh, setRefresh }) {
  const [, L] = useText();
  const { setToast } = useApp();
  const cms = useData("/admin/cms", refresh);
  const [entry, setEntry] = useState({
    key: "",
    locale: "ar",
    value: "",
    status: "draft",
  });
  async function save(e) {
    e.preventDefault();
    try {
      await api(`/admin/cms/${encodeURIComponent(entry.key)}/${entry.locale}`, {
        method: "PUT",
        body: JSON.stringify({ value: entry.value, status: entry.status }),
      });
      setRefresh((x) => x + 1);
      setEntry({ ...entry, key: "", value: "" });
      setToast(L("تم حفظ المحتوى", "Content saved"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="admin-content-grid">
      <form className="settings-form" onSubmit={save}>
        <h2>{L("تحرير المحتوى", "Edit content entry")}</h2>
        <div className="form-columns">
          <label>
            {L("المفتاح", "Key")}
            <input
              value={entry.key}
              required
              onChange={(e) => setEntry({ ...entry, key: e.target.value })}
            />
          </label>
          <label>
            {L("اللغة", "Locale")}
            <select
              value={entry.locale}
              onChange={(e) => setEntry({ ...entry, locale: e.target.value })}
            >
              <option value="ar">ar</option>
              <option value="en">en</option>
            </select>
          </label>
        </div>
        <label>
          {L("القيمة", "Value")}
          <textarea
            value={entry.value}
            required
            onChange={(e) => setEntry({ ...entry, value: e.target.value })}
          />
        </label>
        <label>
          {L("الحالة", "Status")}
          <select
            value={entry.status}
            onChange={(e) => setEntry({ ...entry, status: e.target.value })}
          >
            <option value="draft">{L("مسودة", "Draft")}</option>
            <option value="published">{L("منشور", "Published")}</option>
          </select>
        </label>
        <button className="button button-accent">{L("حفظ", "Save")}</button>
      </form>
      <div className="settings-form">
        <h2>{L("المحتوى الحالي", "Current entries")}</h2>
        <Loadable loading={cms.loading} error={cms.error}>
          {cms.data?.items?.length ? (
            cms.data.items.map((c) => (
              <div className="admin-row" key={`${c.key}-${c.locale}`}>
                <div>
                  <strong>
                    {c.key} · {c.locale}
                  </strong>
                  <p>{c.value?.slice(0, 120)}</p>
                  <small>{c.status}</small>
                </div>
                <button
                  onClick={() =>
                    setEntry({
                      key: c.key,
                      locale: c.locale,
                      value: c.value,
                      status: c.status,
                    })
                  }
                >
                  {L("تحرير", "Edit")}
                </button>
              </div>
            ))
          ) : (
            <p className="muted">{L("لا يوجد محتوى بعد", "No entries yet")}</p>
          )}
        </Loadable>
      </div>
    </div>
  );
}
// --- Admin: background jobs / outbox (wires /admin/outbox) ----------------
function AdminJobsPanel() {
  const [, L] = useText();
  const { setToast } = useApp();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData("/admin/outbox", refresh);
  async function retry(id) {
    try {
      await api(`/admin/outbox/${id}/retry`, { method: "POST" });
      setRefresh((x) => x + 1);
      setToast(L("تمت إعادة الجدولة", "Re-queued"));
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <div className="settings-form">
      <h2>{L("المهام الخلفية", "Background jobs")}</h2>
      <Loadable loading={loading} error={error} onRetry={() => setRefresh((x) => x + 1)}>
        {data?.items?.map((j) => (
          <div className="admin-row" key={j.id}>
            <div>
              <strong>
                {j.kind} · {j.status}
              </strong>
              <small>
                {L("محاولات", "attempts")}: {j.attempts}/{j.maxAttempts}
                {j.lastError ? ` · ${j.lastError.slice(0, 80)}` : ""}
              </small>
            </div>
            {["failed", "dead"].includes(j.status) && (
              <button onClick={() => retry(j.id)}>{L("إعادة", "Retry")}</button>
            )}
          </div>
        ))}
        {data?.items?.length === 0 && (
          <p className="muted">{L("لا توجد مهام", "No jobs")}</p>
        )}
      </Loadable>
    </div>
  );
}
// --- Admin: audit log viewer (wires /admin/audit) -------------------------
function AdminAuditPanel() {
  const [, L] = useText();
  const [page, setPage] = useState(1);
  const { data, loading, error } = useData(`/admin/audit?page=${page}`);
  return (
    <div className="settings-form">
      <h2>{L("سجل التدقيق", "Audit log")}</h2>
      <Loadable loading={loading} error={error}>
        <div className="audit-list">
          {data?.items?.map((a) => (
            <div className="audit-row" key={a.id}>
              <strong>{a.action}</strong>
              <span className="muted">
                {a.subjectType}:{String(a.subjectId).slice(0, 8)}
                {a.details ? ` · ${a.details}` : ""}
              </span>
              <small>{new Date(a.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
        {data && data.totalPages > 1 && (
          <div className="pagination-row">
            <button
              className="button button-outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {L("السابق", "Prev")}
            </button>
            <span>
              {page} / {data.totalPages}
            </span>
            <button
              className="button button-outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {L("التالي", "Next")}
            </button>
          </div>
        )}
      </Loadable>
    </div>
  );
}
function AdminPage() {
  const [t, L] = useText();
  const { user, setToast } = useApp();
  const [refresh, setRefresh] = useState(0),
    [tab, setTab] = useState(user.role === "moderator" ? "reports" : "overview"),
    [selectedChallenge, setSelectedChallenge] = useState(null),
    [form, setForm] = useState({
      title: "",
      description: "",
      community: "launchpad",
      startsAt: "",
      venue: "",
      capacity: 30,
      quantity: 50,
      terms: "",
      code: "",
    });
  const overview = useData("/admin/overview", refresh),
    reports = useData("/admin/reports", refresh),
    orgs = useData("/admin/organizations", refresh),
    mentorsPending = useData("/admin/mentors", refresh),
    challengeList = useData("/challenges", refresh),
    contacts = useData("/admin/contact", refresh),
    subscriptions = useData("/admin/subscriptions", refresh);
  const isAdminRole = ["admin", "super_admin"].includes(user.role);
  if (!isAdminRole && user.role !== "moderator")
    return (
      <Empty
        icon={Shield}
        title={L("ليس لديك صلاحية الدخول", "You do not have access")}
      />
    );
  async function act(endpoint, status) {
    try {
      await api(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setRefresh((x) => x + 1);
      setToast(L("تم حفظ القرار", "Decision saved"));
    } catch (e) {
      setToast(e.message);
    }
  }
  async function create(e, kind) {
    e.preventDefault();
    try {
      // datetime-local has no zone; convert in the browser so the server
      // stores the instant the admin meant (servers run in UTC).
      const toIso = (v) => (v ? new Date(v).toISOString() : v);
      const payload = {
        ...form,
        startsAt: toIso(form.startsAt),
        deadline: toIso(form.deadline),
        ...(kind === "events"
          ? {
              priceType: form.priceType === "paid" ? "paid" : "free",
              priceEgp: form.priceType === "paid" ? Number(form.priceEgp) : undefined,
              capacity: Number(form.capacity),
            }
          : {}),
      };
      await api(`/admin/${kind}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setRefresh((x) => x + 1);
      setForm({ ...form, title: "", description: "" });
      setToast(L("تم النشر", "Published"));
    } catch (e) {
      setToast(e.message);
    }
  }
  async function activateSubscription(id) {
    try {
      await api(`/admin/subscriptions/${id}/activate`, {
        method: "PATCH",
        body: JSON.stringify({ confirmed: true }),
      });
      setRefresh((x) => x + 1);
      setToast(
        L(
          "تم تفعيل الاشتراك بعد تأكيد الدفع",
          "Subscription activated after payment confirmation",
        ),
      );
    } catch (e) {
      setToast(e.message);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow={L("تشغيل المنصة", "PLATFORM OPERATIONS")}
        title={t.admin}
        description={L(
          "بيانات فعلية وإجراءات موثقة، بدون أرقام افتراضية.",
          "Live operational data and audited actions.",
        )}
      />
      <div className="admin-tabs">
        {[
          ["overview", L("نظرة عامة", "Overview")],
          ["challenges", L("التحديات", "Challenges")],
          ["mentors", t.mentors],
          ["reports", L("البلاغات", "Reports")],
          ["organizations", t.organizations],
          ["contact", L("التواصل", "Contact")],
          ["subscriptions", L("الاشتراكات", "Subscriptions")],
          ["perks", L("مزايا الأعضاء", "Member perks")],
          ["workflows", L("مسارات التشغيل", "Workflows")],
          ["events", t.events],
          ["offers", t.offers],
          ["checkin", L("تسجيل الحضور", "Check-in")],
          ["content", L("المجموعات والغرف", "Groups & rooms")],
          ["plans", L("الخطط", "Plans")],
          ["payments", L("المدفوعات", "Payments")],
          ["coupons", L("أكواد الخصم", "Promo codes")],
          ["analytics", L("التحليلات", "Analytics")],
          ["users", L("المستخدمون", "Users")],
          ["flags", L("الميزات", "Feature flags")],
          ["cms", L("المحتوى", "CMS")],
          ["jobs", L("المهام الخلفية", "Background jobs")],
          ["audit", L("سجل التدقيق", "Audit log")],
        ]
          // Moderators only work the reports queue; every other tab calls
          // admin-only endpoints (the server enforces this regardless).
          .filter(([k]) => isAdminRole || k === "reports")
          .map(([k, v]) => (
          <button
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
            key={k}
          >
            {v}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <Loadable loading={overview.loading} error={overview.error}>
          <div className="stat-grid">
            {[
              ["members", t.members, Users],
              ["posts", t.feed, MessageCircle],
              ["events", t.events, CalendarDays],
              ["openReports", L("بلاغات مفتوحة", "Open reports"), Flag],
              [
                "pendingOrganizations",
                L("مؤسسات للمراجعة", "Pending organizations"),
                Building2,
              ],
              ["openContacts", L("طلبات تواصل", "Contact requests"), Mail],
              [
                "pendingSubscriptions",
                L("اشتراكات بانتظار الدفع", "Pending subscriptions"),
                CreditCard,
              ],
              [
                "pendingGroupRequests",
                L("طلبات مجموعات", "Group requests"),
                Users,
              ],
              [
                "pendingRoomApplications",
                L("طلبات غرف", "Room applications"),
                Layers,
              ],
              [
                "pendingPartnerships",
                L("طلبات شراكات", "Partnership requests"),
                Handshake,
              ],
              [
                "pendingPerkApplications",
                L("طلبات مزايا", "Perk applications"),
                Gift,
              ],
            ].map(([key, label, Icon]) => (
              <div className="stat-card" key={key}>
                <Icon size={22} />
                <strong>{overview.data?.[key] ?? 0}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Loadable>
      )}
      {tab === "workflows" && (
        <AdminWorkflowPanel refresh={refresh} setRefresh={setRefresh} />
      )}
      {tab === "perks" && (
        <>
          <AdminPerksPanel refresh={refresh} setRefresh={setRefresh} />
          <AdminPerkCatalog refresh={refresh} setRefresh={setRefresh} />
        </>
      )}
      {tab === "checkin" && <AdminCheckInPanel />}
      {tab === "content" && (
        <AdminContentPanel refresh={refresh} setRefresh={setRefresh} />
      )}
      {tab === "plans" && (
        <AdminPlansPanel refresh={refresh} setRefresh={setRefresh} />
      )}
      {tab === "payments" && <AdminPaymentsPanel />}
      {tab === "coupons" && <AdminCouponsPanel />}
      {tab === "analytics" && <AdminAnalyticsPanel />}
      {tab === "users" && <AdminUsersPanel currentUser={user} />}
      {tab === "flags" && (
        <AdminFlagsPanel refresh={refresh} setRefresh={setRefresh} />
      )}
      {tab === "cms" && (
        <AdminCmsPanel refresh={refresh} setRefresh={setRefresh} />
      )}
      {tab === "jobs" && <AdminJobsPanel />}
      {tab === "audit" && <AdminAuditPanel />}
      {tab === "subscriptions" && (
        <Loadable loading={subscriptions.loading} error={subscriptions.error}>
          {subscriptions.data?.items?.length ? (
            subscriptions.data.items.map((item) => (
              <div className="admin-row" key={item.id}>
                <div>
                  <strong>
                    {item.user?.name} · {item.plan?.nameEn}
                  </strong>
                  <p>
                    {formatEgp(item.amountEgp, "en")} · {item.billingCycle}
                  </p>
                  <small>
                    {item.user?.email} ·{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </small>
                </div>
                <button onClick={() => activateSubscription(item.id)}>
                  {L("تأكيد الدفع والتفعيل", "Confirm payment & activate")}
                </button>
              </div>
            ))
          ) : (
            <Empty
              icon={CreditCard}
              title={L("لا توجد اشتراكات معلقة", "No pending subscriptions")}
            />
          )}
        </Loadable>
      )}
      {tab === "mentors" && (
        <Loadable loading={mentorsPending.loading} error={mentorsPending.error}>
          {mentorsPending.data?.items?.length ? (
            mentorsPending.data.items.map((m) => (
              <div className="admin-row" key={m.id}>
                <div>
                  <strong>{m.User?.name}</strong>
                  <p>{m.expertise}</p>
                </div>
                <button
                  onClick={async () => {
                    await api(`/admin/mentors/${m.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ published: true }),
                    });
                    setRefresh((x) => x + 1);
                  }}
                >
                  {L("اعتماد", "Approve")}
                </button>
              </div>
            ))
          ) : (
            <Empty
              icon={Lightbulb}
              title={L("لا توجد طلبات إرشاد", "No mentor profiles to review")}
            />
          )}
        </Loadable>
      )}
      {tab === "reports" && (
        <Loadable loading={reports.loading} error={reports.error}>
          {reports.data?.items?.length ? (
            reports.data.items.map((r) => (
              <div className="admin-row" key={r.id}>
                <div>
                  <strong>{r.reason}</strong>
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                </div>
                <div>
                  <button
                    onClick={() => act(`/admin/reports/${r.id}`, "resolved")}
                  >
                    {L("إغلاق", "Resolve")}
                  </button>
                  <button
                    onClick={() => act(`/admin/reports/${r.id}`, "dismissed")}
                  >
                    {L("رفض البلاغ", "Dismiss")}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty
              icon={Flag}
              title={L("لا توجد بلاغات مفتوحة", "No open reports")}
            />
          )}
        </Loadable>
      )}
      {tab === "contact" && (
        <Loadable loading={contacts.loading} error={contacts.error}>
          {contacts.data?.items?.length ? (
            contacts.data.items.map((c) => (
              <div className="admin-row" key={c.id}>
                <div>
                  <strong>
                    {c.name} · {c.topic}
                  </strong>
                  <p>{c.message}</p>
                  <small>
                    {c.email} · {new Date(c.createdAt).toLocaleString()}
                  </small>
                </div>
                <button onClick={() => act(`/admin/contact/${c.id}`, "closed")}>
                  {L("إغلاق الطلب", "Close request")}
                </button>
              </div>
            ))
          ) : (
            <Empty
              icon={Mail}
              title={L(
                "لا توجد طلبات تواصل مفتوحة",
                "No open contact requests",
              )}
            />
          )}
        </Loadable>
      )}
      {tab === "organizations" && (
        <Loadable loading={orgs.loading} error={orgs.error}>
          {orgs.data?.items?.length ? (
            orgs.data.items.map((o) => (
              <div className="admin-row" key={o.id}>
                <div>
                  <strong>{o.name}</strong>
                  <p>{o.description}</p>
                </div>
                <div>
                  <button
                    onClick={() =>
                      act(`/admin/organizations/${o.id}`, "approved")
                    }
                  >
                    {L("قبول", "Approve")}
                  </button>
                  <button
                    onClick={() =>
                      act(`/admin/organizations/${o.id}`, "rejected")
                    }
                  >
                    {L("رفض", "Reject")}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty
              icon={Building2}
              title={L("لا توجد طلبات معلقة", "No pending requests")}
            />
          )}
        </Loadable>
      )}
      {tab === "events" && <AdminEventsList refresh={refresh} setRefresh={setRefresh} />}
      {["events", "offers", "challenges"].includes(tab) && (
        <form
          className="settings-form admin-form"
          onSubmit={(e) => create(e, tab)}
        >
          <h2>
            {tab === "events"
              ? L("انشر فعالية", "Publish an event")
              : tab === "challenges"
                ? L("انشر تحديًا", "Publish a challenge")
                : L("انشر ميزة", "Publish a perk")}
          </h2>
          <label>
            {L("العنوان", "Title")}
            <input
              required
              minLength="3"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            {L("الوصف", "Description")}
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          {tab === "challenges" ? (
            <>
              <label>
                {t.communities}
                <select
                  value={form.community}
                  onChange={(e) =>
                    setForm({ ...form, community: e.target.value })
                  }
                >
                  {personaData.map((p) => (
                    <option value={p.slug} key={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {L("الموعد النهائي", "Deadline")}
                <input
                  required
                  type="datetime-local"
                  value={form.deadline || ""}
                  onChange={(e) =>
                    setForm({ ...form, deadline: e.target.value })
                  }
                />
              </label>
            </>
          ) : tab === "events" ? (
            <>
              <label>
                {t.communities}
                <select
                  value={form.community}
                  onChange={(e) =>
                    setForm({ ...form, community: e.target.value })
                  }
                >
                  {personaData.map((p) => (
                    <option value={p.slug} key={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {L("الموعد", "Starts at")}
                <input
                  required
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm({ ...form, startsAt: e.target.value })
                  }
                />
              </label>
              <label>
                {L("المكان", "Venue")}
                <input
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                />
              </label>
              <label>
                {L("السعة", "Capacity")}
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: e.target.value })
                  }
                />
              </label>
              <label>
                {L("نوع التسجيل", "Registration type")}
                <select
                  value={form.priceType || "free"}
                  onChange={(e) => setForm({ ...form, priceType: e.target.value })}
                >
                  <option value="free">{L("مجاني", "Free")}</option>
                  <option value="paid">{L("مدفوع (تذكرة)", "Paid ticket")}</option>
                </select>
              </label>
              {form.priceType === "paid" && (
                <label>
                  {L("سعر التذكرة (ج.م)", "Ticket price (EGP)")}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={form.priceEgp || ""}
                    onChange={(e) => setForm({ ...form, priceEgp: e.target.value })}
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <label>
                {L("الشروط", "Terms")}
                <textarea
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                />
              </label>
              <label>
                {L("العدد المتاح", "Quantity")}
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                />
              </label>
              <label>
                {L("الكود إن وجد", "Optional code")}
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
            </>
          )}
          <button className="button button-accent">
            {t.publish}
            <ArrowUpLeft size={17} />
          </button>
        </form>
      )}
      {tab === "challenges" && (
        <div className="admin-challenge-list">
          <h2>{L("المشاركات للمراجعة", "Submissions to review")}</h2>
          {challengeList.data?.items?.map((c) => (
            <button
              key={c.id}
              className={selectedChallenge === c.id ? "selected" : ""}
              onClick={() => setSelectedChallenge(c.id)}
            >
              {c.title}
              <ArrowUpLeft size={16} />
            </button>
          ))}
          {selectedChallenge && (
            <ChallengeReview key={selectedChallenge} id={selectedChallenge} />
          )}
        </div>
      )}
    </>
  );
}
function Explore() {
  const [t, L] = useText();
  return (
    <>
      <PageHero
        eyebrow={L("خريطتك داخل USAM", "YOUR MAP INSIDE USAM")}
        title={t.explore}
        body={L(
          "كل باب يقود إلى أشخاص وتجارب وفرص مختلفة. اختر ما يناسبك الآن.",
          "Every door leads to different people, experiences and opportunities. Choose what fits today.",
        )}
        icon={Compass}
      />
      <div className="wrap explore-grid">
        {[
          [
            Users,
            t.communities,
            L(
              "مجتمعات متخصصة تجمع أصحاب الاهتمام نفسه.",
              "Focused communities with shared interests.",
            ),
            "/communities",
          ],
          [
            MessageCircle,
            t.feed,
            L(
              "شارك خبرة أو سؤالًا وابدأ نقاشًا.",
              "Share an insight or question and start a conversation.",
            ),
            "/feed",
          ],
          [
            CalendarDays,
            t.events,
            L(
              "لقاءات مهنية وحوارات مباشرة.",
              "Professional gatherings and live conversations.",
            ),
            "/events",
          ],
          [
            Lightbulb,
            t.mentors,
            L(
              "خبراء يشاركون رؤيتهم معك.",
              "Experts sharing perspectives with you.",
            ),
            "/mentors",
          ],
          [
            Target,
            L("التحديات", "Challenges"),
            L(
              "شارك بأفكارك في تحديات المجتمع.",
              "Contribute your ideas to community challenges.",
            ),
            "/challenges",
          ],
          [
            Gift,
            t.offers,
            L(
              "مزايا تنشرها الجهات المعتمدة.",
              "Perks published by reviewed issuers.",
            ),
            "/offers",
          ],
          [
            Building2,
            t.organizations,
            L("مؤسسات داخل شبكة USAM.", "Organizations in the USAM network."),
            "/organizations",
          ],
          [
            BriefcaseBusiness,
            t.jobs,
            L(
              "الوظائف والتقديم عبر USAM Career & Jobs.",
              "Jobs and applications through USAM Career & Jobs.",
            ),
            "/opportunities",
          ],
          [
            Search,
            t.search,
            L(
              "اعثر على الأشخاص والمحتوى المناسب.",
              "Find people and relevant content.",
            ),
            "/search",
          ],
          [
            BookOpen,
            L("الموارد", "Resources"),
            L(
              "أدلة وقوالب عملية لكل مسار.",
              "Practical guides and templates for every path.",
            ),
            "/resources",
          ],
          [
            Mail,
            L("تواصل معنا", "Contact"),
            L(
              "استفسار أو شراكة أو طلب مساعدة.",
              "Questions, partnerships or support.",
            ),
            "/contact",
          ],
        ].map(([Icon, title, body, href], i) => (
          <Link to={href} key={href} className="explore-card">
            <span className="explore-card-top">
              <Icon size={25} />
              <small>0{i + 1}</small>
            </span>
            <h2>{title}</h2>
            <p>{body}</p>
            <ArrowUpLeft size={20} />
          </Link>
        ))}
      </div>
    </>
  );
}
function InfoPage({ type }) {
  const [t, L] = useText();
  const map = {
    about: [
      L("عن USAM Communities", "About USAM Communities"),
      L(
        "شبكة مهنية لأربع مجتمعات متخصصة.",
        "A professional network for four focused communities.",
      ),
      L(
        "تربط USAM Communities المؤسسين والمستقلين وأصحاب العمل والطلاب حول حوارات وفعاليات وفرص مفيدة. انضم للمجتمع المناسب لك، وشارك برغبتك وبالقدر الذي يناسبك.",
        "USAM Communities brings founders, independents, employers and students together around useful conversations, events and opportunities. Join the space that fits and participate on your terms.",
      ),
    ],
    how: [
      L("كيف تعمل", "How it works"),
      L("ثلاث خطوات بسيطة تبدأ بها.", "Three simple steps to get started."),
      L(
        "أنشئ حسابك، اختر مجتمعًا أو أكثر، وشارك في النقاشات أو احضر فعالية. ملفك في دليل الأعضاء لا يظهر إلا إذا اخترت ذلك من الإعدادات.",
        "Create an account, choose one or more communities and join conversations or events. Your profile appears in the member directory only if you opt in.",
      ),
    ],
    guidelines: [
      L("قواعد المجتمع", "Community guidelines"),
      L(
        "مساحة تحترم وقت الناس وخصوصيتهم.",
        "A space that respects people and privacy.",
      ),
      L(
        "انشر محتوى مهنيًا صادقًا وذا صلة، احترم الآخرين، لا تشارك بياناتهم دون إذن، ولا ترسل رسائل مزعجة أو عروضًا مضللة. يمكنك الإبلاغ عن المحتوى المخالف لتراجعه الإدارة.",
        "Post honest, relevant professional content. Respect others, do not share personal data without consent, and avoid spam or misleading offers. Report content that breaches these rules for moderator review.",
      ),
    ],
    privacy: [
      L("الخصوصية", "Privacy"),
      L("أنت تتحكم في ظهور ملفك.", "You control your profile visibility."),
      L(
        "نحتفظ بالبيانات اللازمة للحساب والمشاركة، مثل الاسم والبريد والمنشورات والتسجيل في الفعاليات. لا يظهر ملفك في دليل الأعضاء إلا باختيارك. تُزال بيانات الموقع والجهاز من الصور قبل حفظها. يمكنك من الإعدادات تنزيل نسخة من بياناتك أو حذف حسابك؛ يُمسح ملفك وعلاقاتك فورًا وتُحذف بقية بياناتك الشخصية خلال ٣٠ يومًا، مع الاحتفاظ بسجلات الدفع للأغراض المحاسبية. للاستفسار عن بياناتك استخدم صفحة التواصل.",
        "We retain account and participation data such as name, email, posts and event registrations. Your member directory visibility is opt in. Location and device metadata is removed from uploaded images before storage. From Settings you can download a copy of your data or delete your account: your profile and connections are removed immediately and remaining personal data within 30 days, while payment records are kept for accounting. For data questions, use the contact page.",
      ),
    ],
    terms: [
      L("شروط الاستخدام", "Terms of use"),
      L(
        "قواعد واضحة لاستخدام مهني وآمن.",
        "Clear rules for safe, professional use.",
      ),
      L(
        "باستخدام المنصة توافق على تقديم معلومات صحيحة، واحترام حقوق الآخرين، وعدم إساءة استخدام الرسائل أو المحتوى أو المزايا. قد تُقيّد الحسابات المخالفة بعد مراجعة بشرية. الاشتراكات المدفوعة لا تُفعّل إلا بعد تأكيد الدفع، وتخضع النسخة النهائية من هذه الشروط لمراجعة قانونية مصرية قبل التشغيل التجاري.",
        "By using the platform you agree to provide accurate information, respect others' rights and avoid misuse of messages, content or benefits. Accounts may be restricted after human review. Paid access activates only after payment confirmation, and the final terms require Egyptian legal review before commercial operation.",
      ),
    ],
    refunds: [
      L("الإلغاء والاسترداد", "Cancellation and refunds"),
      L(
        "اعرف ما يحدث قبل أن تختار خطة مدفوعة.",
        "Know what happens before choosing a paid plan.",
      ),
      L(
        "يمكن إلغاء التجديد في أي وقت مع استمرار المزايا المدفوعة حتى نهاية الفترة المسددة. طلبات الاسترداد تُراجع حسب حالة التفعيل والاستخدام وطريقة الدفع، ولا تُرسل أي بيانات بطاقة إلى USAM. سياسة الاسترداد النهائية والمهل الزمنية تحتاج اعتمادًا قانونيًا ومحاسبيًا قبل تفعيل الدفع الحي.",
        "You can cancel renewal at any time and retain paid benefits until the end of the paid period. Refund requests are reviewed based on activation, usage and payment method, and USAM never receives raw card data. Final refund windows require legal and accounting approval before live payments are enabled.",
      ),
    ],
    accessibility: [
      L("إمكانية الوصول", "Accessibility"),
      L(
        "تجربة يمكن استخدامها بوضوح عبر الأجهزة وطرق الإدخال المختلفة.",
        "A clear experience across devices and input methods.",
      ),
      L(
        "يدعم الموقع العربية والإنجليزية واتجاهي RTL وLTR، والتنقل بلوحة المفاتيح، وروابط تخطي المحتوى، وتباين الألوان، وحالات تركيز واضحة. نواصل اختبار قارئات الشاشة وتقليل الحركة والصفحات الكثيفة؛ أرسل أي عائق عبر صفحة التواصل.",
        "The site supports Arabic and English, RTL and LTR, keyboard navigation, skip links, color contrast and visible focus states. Screen-reader, reduced-motion and dense-page testing continues; report any barrier through the contact page.",
      ),
    ],
  }[type];
  return (
    <>
      <PageHero
        eyebrow="USAM COMMUNITIES"
        title={map[0]}
        body={map[1]}
        icon={
          ["privacy", "terms", "refunds"].includes(type) ? LockKeyhole : Info
        }
      />
      <div className="wrap info-content">
        <p>{map[2]}</p>
        <div className="info-note">
          <Info size={20} />
          {L(
            "هذا ملخص تشغيلي واضح، وليس بديلًا عن النص القانوني الذي يجب اعتماده قبل تحصيل مدفوعات حية.",
            "This is a clear operational summary, not a substitute for legal text approved before live payment collection.",
          )}
        </div>
        <Link to="/communities" className="button button-accent">
          {t.communities}
          <ArrowUpLeft size={17} />
        </Link>
      </div>
    </>
  );
}
function NotFound() {
  const [t, L] = useText();
  return (
    <div className="not-found">
      <span>404</span>
      <h1>{L("الصفحة مش هنا.", "This page isn’t here.")}</h1>
      <p>
        {L(
          "ارجع للرئيسية واستكشف المساحات المتاحة.",
          "Go back and explore the available spaces.",
        )}
      </p>
      <Link to="/" className="button button-accent">
        {t.home}
        <ArrowUpLeft size={17} />
      </Link>
    </div>
  );
}
function Forbidden() {
  const [t, L] = useText();
  return (
    <div className="not-found">
      <span>403</span>
      <h1>{L("لا تملك صلاحية الوصول لهذه الصفحة.", "You don't have access to this page.")}</h1>
      <p>
        {L(
          "قد تحتاج صلاحية أعلى أو حسابًا موثقًا. تواصل مع فريق الإدارة إذا كنت تتوقع وصولًا.",
          "You may need a higher role or a verified account. Contact an admin if you expect access.",
        )}
      </p>
      <Link to="/home" className="button button-accent">
        {t.dashboard}
        <ArrowUpLeft size={17} />
      </Link>
    </div>
  );
}
function ForgotPasswordPage() {
  const [t, L] = useText();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
      // Deliberately ignored: the backend always returns 200 here to avoid
      // leaking which emails have accounts. Any network error still shows
      // the same confirmation so behavior can't be used to enumerate users.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-top">
          <Brand />
          <Link to="/login" className="text-link">
            {L("العودة لتسجيل الدخول", "Back to sign in")}
            <ArrowUpLeft size={16} />
          </Link>
        </div>
        <div className="auth-form">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            USAM COMMUNITIES
          </span>
          <h1>{L("استعد الوصول لحسابك.", "Recover your account.")}</h1>
          <p>
            {L(
              "أدخل بريدك الإلكتروني وسنرسل رابطًا لإعادة تعيين كلمة المرور إذا وُجد حساب مطابق.",
              "Enter your email and we'll send a password reset link if a matching account exists.",
            )}
          </p>
          {sent ? (
            <div className="form-error" role="status" style={{ background: "var(--soft)", color: "var(--accent-dark)" }}>
              <CheckCircle2 size={17} />
              {L(
                "إذا وُجد حساب بهذا البريد، ستصلك رسالة بخطوات إعادة التعيين.",
                "If an account exists for that email, a reset link is on its way.",
              )}
            </div>
          ) : (
            <form onSubmit={submit}>
              <label>
                {L("البريد الإلكتروني", "Email")}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="button button-accent auth-submit" disabled={busy}>
                {busy ? t.loading : L("أرسل رابط الاستعادة", "Send reset link")}
                <ArrowUpLeft size={18} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
function ResetPasswordPage() {
  const [t, L] = useText();
  const navigate = useNavigate();
  const token = new URLSearchParams(useLocation().search).get("token") || "";
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError(L("كلمتا المرور غير متطابقتين", "Passwords do not match"));
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password: form.password }),
      });
      navigate("/login", {
        state: { from: "/reset-password" },
        replace: true,
      });
    } catch (e) {
      setError(
        {
          invalid_or_expired_token: L(
            "الرابط غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.",
            "This link is invalid or expired. Request a new one.",
          ),
          weak_password: L(
            "كلمة المرور ضعيفة (١٠ أحرف على الأقل، حروف وأرقام)",
            "Weak password (10+ chars, letters & digits)",
          ),
        }[e.message] || t.error,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!token) {
    return (
      <div className="not-found">
        <span>!</span>
        <h1>{L("رابط إعادة التعيين غير مكتمل.", "This reset link is incomplete.")}</h1>
        <Link to="/forgot-password" className="button button-accent">
          {L("اطلب رابطًا جديدًا", "Request a new link")}
          <ArrowUpLeft size={17} />
        </Link>
      </div>
    );
  }
  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-top">
          <Brand />
        </div>
        <div className="auth-form">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            USAM COMMUNITIES
          </span>
          <h1>{L("عيّن كلمة مرور جديدة.", "Set a new password.")}</h1>
          <form onSubmit={submit}>
            <label>
              {L("كلمة المرور الجديدة", "New password")}
              <input
                type="password"
                required
                minLength="10"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label>
              {L("تأكيد كلمة المرور", "Confirm password")}
              <input
                type="password"
                required
                minLength="10"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                <AlertCircle size={17} />
                {error}
              </div>
            )}
            <button className="button button-accent auth-submit" disabled={busy}>
              {busy ? t.loading : L("تحديث كلمة المرور", "Update password")}
              <ArrowUpLeft size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
function VerifyEmailPage() {
  const [t, L] = useText();
  const { user, setUser } = useApp();
  const token = new URLSearchParams(useLocation().search).get("token") || "";
  const [state, setState] = useState("checking"); // checking | ok | error
  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    api(`/auth/verify-email/${token}`)
      .then(() => {
        setState("ok");
        if (user) setUser({ ...user, emailVerified: true });
      })
      .catch(() => setState("error"));
  }, [token]);
  return (
    <div className="not-found">
      {state === "checking" && (
        <>
          <span>…</span>
          <h1>{L("جارٍ توثيق بريدك الإلكتروني…", "Verifying your email…")}</h1>
        </>
      )}
      {state === "ok" && (
        <>
          <span>✓</span>
          <h1>{L("تم توثيق بريدك الإلكتروني.", "Your email is verified.")}</h1>
          <Link to={user ? "/home" : "/login"} className="button button-accent">
            {user ? t.dashboard : t.login}
            <ArrowUpLeft size={17} />
          </Link>
        </>
      )}
      {state === "error" && (
        <>
          <span>!</span>
          <h1>
            {L(
              "رابط التوثيق غير صالح أو منتهي الصلاحية.",
              "This verification link is invalid or expired.",
            )}
          </h1>
          <Link to="/settings" className="button button-accent">
            {L("أعد الإرسال من الإعدادات", "Resend from settings")}
            <ArrowUpLeft size={17} />
          </Link>
        </>
      )}
    </div>
  );
}
// Site-wide notice managed in Admin → CMS (key: site_announcement, published).
// Rendered as plain text (never HTML), so CMS content can't inject markup.
function AnnouncementBanner() {
  const { platform } = useApp();
  const text = platform.content?.site_announcement;
  if (!text) return null;
  return (
    <div className="announcement-banner" role="status">
      <Info size={16} />
      <span>{text}</span>
    </div>
  );
}
function PublicLayout({ children }) {
  return (
    <>
      <AnnouncementBanner />
      <Header />
      <main id="main" tabIndex="-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
function RouteFrame({ children, protectedRoute = false }) {
  const { user } = useApp();
  return protectedRoute ? (
    <Protected>{children}</Protected>
  ) : user ? (
    <AppShell>{children}</AppShell>
  ) : (
    <PublicLayout>
      {<div className="public-app-page wrap">{children}</div>}
    </PublicLayout>
  );
}
function RouteApp() {
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
    function key(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/search");
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [navigate]);
  return (
    <Routes>
      <Route
        path="/"
        element={
          <PublicLayout>
            <Home />
          </PublicLayout>
        }
      />
      <Route
        path="/communities"
        element={
          <PublicLayout>
            <Communities />
          </PublicLayout>
        }
      />
      <Route
        path="/communities/:slug"
        element={
          <PublicLayout>
            <CommunityDetail />
          </PublicLayout>
        }
      />
      <Route
        path="/explore"
        element={
          <PublicLayout>
            <Explore />
          </PublicLayout>
        }
      />
      <Route
        path="/programs"
        element={
          <PublicLayout>
            <ExperienceCatalog type="programs" />
          </PublicLayout>
        }
      />
      <Route
        path="/rooms"
        element={
          <PublicLayout>
            <ExperienceCatalog type="rooms" />
          </PublicLayout>
        }
      />
      <Route
        path="/partners"
        element={
          <PublicLayout>
            <ExperienceCatalog type="partners" />
          </PublicLayout>
        }
      />
      <Route
        path="/pricing"
        element={
          <PublicLayout>
            <PricingPage />
          </PublicLayout>
        }
      />
      <Route
        path="/resources"
        element={
          <PublicLayout>
            <ResourcesPage />
          </PublicLayout>
        }
      />
      <Route
        path="/resources/:slug"
        element={
          <PublicLayout>
            <ResourceDetail />
          </PublicLayout>
        }
      />
      <Route
        path="/faq"
        element={
          <PublicLayout>
            <FAQPage />
          </PublicLayout>
        }
      />
      <Route
        path="/contact"
        element={
          <PublicLayout>
            <ContactPage />
          </PublicLayout>
        }
      />
      <Route
        path="/about"
        element={
          <PublicLayout>
            <InfoPage type="about" />
          </PublicLayout>
        }
      />
      <Route
        path="/how-it-works"
        element={
          <PublicLayout>
            <InfoPage type="how" />
          </PublicLayout>
        }
      />
      <Route
        path="/guidelines"
        element={
          <PublicLayout>
            <InfoPage type="guidelines" />
          </PublicLayout>
        }
      />
      <Route
        path="/privacy"
        element={
          <PublicLayout>
            <InfoPage type="privacy" />
          </PublicLayout>
        }
      />
      <Route
        path="/terms"
        element={
          <PublicLayout>
            <InfoPage type="terms" />
          </PublicLayout>
        }
      />
      <Route
        path="/refund-policy"
        element={
          <PublicLayout>
            <InfoPage type="refunds" />
          </PublicLayout>
        }
      />
      <Route
        path="/accessibility"
        element={
          <PublicLayout>
            <InfoPage type="accessibility" />
          </PublicLayout>
        }
      />
      <Route path="/login" element={<Auth />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/403"
        element={
          <PublicLayout>
            <Forbidden />
          </PublicLayout>
        }
      />
      <Route
        path="/home"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
      <Route
        path="/feed"
        element={
          <RouteFrame>
            <Feed />
          </RouteFrame>
        }
      />
      <Route
        path="/posts/:id"
        element={
          <RouteFrame>
            <PostDetail />
          </RouteFrame>
        }
      />
      <Route
        path="/events"
        element={
          <RouteFrame>
            <Directory kind="events" />
          </RouteFrame>
        }
      />
      <Route
        path="/events/:id"
        element={
          <RouteFrame>
            <EventDetail />
          </RouteFrame>
        }
      />
      <Route
        path="/challenges"
        element={
          <RouteFrame>
            <ChallengesPage />
          </RouteFrame>
        }
      />
      <Route
        path="/challenges/:id"
        element={
          <RouteFrame>
            <ChallengeDetail />
          </RouteFrame>
        }
      />
      <Route
        path="/my-submissions"
        element={
          <Protected>
            <MySubmissions />
          </Protected>
        }
      />
      <Route
        path="/activity"
        element={
          <Protected>
            <ActivityPage />
          </Protected>
        }
      />
      <Route
        path="/my-events"
        element={
          <Protected>
            <MyEventsPage />
          </Protected>
        }
      />
      <Route
        path="/messages"
        element={
          <Protected>
            <MessagesPage />
          </Protected>
        }
      />
      <Route
        path="/messages/:id"
        element={
          <Protected>
            <MessagesPage />
          </Protected>
        }
      />
      <Route
        path="/mentorship"
        element={
          <Protected>
            <MentorshipPage />
          </Protected>
        }
      />
      <Route
        path="/offers"
        element={
          <RouteFrame>
            <Directory kind="offers" />
          </RouteFrame>
        }
      />
      <Route
        path="/perks"
        element={
          <PublicLayout>
            <PerksPage />
          </PublicLayout>
        }
      />
      <Route
        path="/members"
        element={
          <RouteFrame>
            <Directory kind="members" />
          </RouteFrame>
        }
      />
      <Route
        path="/members/:username"
        element={
          <RouteFrame>
            <MemberProfile />
          </RouteFrame>
        }
      />
      <Route
        path="/organizations"
        element={
          <RouteFrame>
            <Directory kind="organizations" />
          </RouteFrame>
        }
      />
      <Route
        path="/mentors"
        element={
          <RouteFrame>
            <Directory kind="mentors" />
          </RouteFrame>
        }
      />
      <Route
        path="/opportunities"
        element={
          <RouteFrame>
            <Opportunities />
          </RouteFrame>
        }
      />
      <Route path="/jobs" element={<Navigate to="/opportunities" replace />} />
      <Route
        path="/search"
        element={
          <RouteFrame>
            <SearchPage />
          </RouteFrame>
        }
      />
      <Route
        path="/me"
        element={
          <Protected>
            <Profile />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <SettingsPage />
          </Protected>
        }
      />
      <Route
        path="/checkout/:planCode"
        element={
          <Protected>
            <CheckoutPage />
          </Protected>
        }
      />
      <Route
        path="/billing"
        element={
          <Protected>
            <BillingPage />
          </Protected>
        }
      />
      <Route
        path="/saved"
        element={
          <Protected>
            <Feed savedOnly />
          </Protected>
        }
      />
      <Route
        path="/notifications"
        element={
          <Protected>
            <Notifications />
          </Protected>
        }
      />
      <Route
        path="/organization/new"
        element={
          <Protected>
            <OrganizationNew />
          </Protected>
        }
      />
      <Route
        path="/participation"
        element={
          <Protected>
            <ParticipationPage />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminPage />
          </Protected>
        }
      />
      <Route
        path="*"
        element={
          <PublicLayout>
            <NotFound />
          </PublicLayout>
        }
      />
    </Routes>
  );
}
function MessagesPage() {
  const { id } = useParams(),
    { user, setToast } = useApp();
  const [t, L] = useText();
  const { onLive } = useApp();
  const [refresh, setRefresh] = useState(0),
    [body, setBody] = useState(""),
    [sending, setSending] = useState(false),
    [older, setOlder] = useState([]),
    [olderCursor, setOlderCursor] = useState(undefined),
    [loadingOlder, setLoadingOlder] = useState(false);
  const list = useData("/messages", refresh),
    thread = useData(id ? `/messages/${id}` : null, refresh);
  // Live: refresh the list on any message/read event, and the open thread
  // when the event belongs to it.
  useEffect(
    () =>
      onLive((kind, data) => {
        if (kind === "message" || kind === "read") setRefresh((x) => x + 1);
      }),
    [id],
  );
  useEffect(() => {
    setOlder([]);
    setOlderCursor(undefined);
  }, [id]);
  const cursor = olderCursor === undefined ? thread.data?.nextBefore : olderCursor;
  async function loadOlder() {
    if (!cursor) return;
    setLoadingOlder(true);
    try {
      const p = await api(`/messages/${id}?before=${encodeURIComponent(cursor)}`);
      setOlder((x) => [...p.items, ...x]);
      setOlderCursor(p.nextBefore || null);
    } catch (e) {
      setToast(e.message);
    } finally {
      setLoadingOlder(false);
    }
  }
  async function send(e) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await api(`/messages/${id}`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setBody("");
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(
        {
          messaging_unavailable: L("المراسلة غير متاحة مع هذا العضو", "Messaging is not available with this member"),
          invalid_message: L("اكتب رسالة أولًا", "Write a message first"),
          email_verification_required: L("وثّق بريدك لإرسال الرسائل", "Verify your email to send messages"),
        }[e.message] || e.message,
      );
    } finally {
      setSending(false);
    }
  }
  const unreadHere = list.data?.items?.find((c) => c.id === id)?.unread || 0;
  useEffect(() => {
    if (id)
      api(`/messages/${id}/read`, { method: "PATCH" }).catch(() => {});
  }, [id, unreadHere]);
  const shown = [...older, ...(thread.data?.items || [])];
  const scrollRef = React.useRef(null);
  const lastId = thread.data?.items?.at(-1)?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  return (
    <>
      <AppHeading
        eyebrow={L("تواصل بوضوح", "STAY CONNECTED")}
        title={L("الرسائل", "Messages")}
        description={L(
          "محادثات بين أعضاء وافقوا على التواصل داخل مجتمع مشترك.",
          "Conversations between opted-in members of a shared community.",
        )}
      />
      <div className="messages-layout">
        <div className="message-list">
          <h2>{L("المحادثات", "Conversations")}</h2>
          <Loadable loading={list.loading} error={list.error}>
            {list.data?.items?.length ? (
              list.data.items.map((c) => (
                <Link
                  className={`message-peer ${id === c.id ? "active" : ""}`}
                  to={`/messages/${c.id}`}
                  key={c.id}
                >
                  <span className="avatar">{c.other?.name?.charAt(0)}</span>
                  <span>
                    <strong>{c.other?.name}</strong>
                    {c.lastMessage && (
                      <small className="message-preview">
                        {c.lastMessage.mine ? L("أنت: ", "You: ") : ""}
                        {c.lastMessage.body}
                      </small>
                    )}
                    <small>{new Date(c.updatedAt).toLocaleString()}</small>
                  </span>
                  {c.unread > 0 ? (
                    <span
                      className="unread-badge"
                      aria-label={L(`${c.unread} غير مقروءة`, `${c.unread} unread`)}
                    >
                      {c.unread}
                    </span>
                  ) : (
                    <ArrowUpLeft size={15} />
                  )}
                </Link>
              ))
            ) : (
              <Empty
                icon={Mail}
                title={L("لا توجد محادثات بعد", "No conversations yet")}
                body={L(
                  "فعّل استقبال الرسائل واكتشف أعضاء مجتمعك.",
                  "Enable messages and discover members of your communities.",
                )}
                action={t.members}
                href="/members"
              />
            )}
          </Loadable>
        </div>
        <div className="message-thread">
          {id ? (
            <Loadable loading={thread.loading} error={thread.error}>
              {thread.data?.items ? (
                <>
                  <header>
                    <span className="avatar">
                      {thread.data.other?.name?.charAt(0)}
                    </span>
                    <strong>{thread.data.other?.name}</strong>
                    <button
                      className="icon-btn"
                      onClick={() => setRefresh((x) => x + 1)}
                      aria-label={t.retry}
                    >
                      <RefreshCcw size={17} />
                    </button>
                  </header>
                  <div className="message-scroll" ref={scrollRef}>
                    {cursor && (
                      <button
                        type="button"
                        className="button button-outline load-older"
                        onClick={loadOlder}
                        disabled={loadingOlder}
                      >
                        {L("تحميل رسائل أقدم", "Load older messages")}
                      </button>
                    )}
                    {shown.length ? (
                      shown.map((m) => (
                        <div
                          key={m.id}
                          className={`message-bubble ${m.SenderId === user.id ? "mine" : ""}`}
                        >
                          <p>{m.body}</p>
                          <small>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        {L(
                          "ابدأ محادثة مهنية واضحة ومحترمة.",
                          "Start a thoughtful professional conversation.",
                        )}
                      </p>
                    )}
                  </div>
                  <form onSubmit={send} className="message-compose">
                    <input
                      required
                      maxLength="2000"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={L("اكتب رسالتك...", "Write your message...")}
                    />
                    <button className="button button-accent" disabled={sending}>
                      {L("إرسال", "Send")}
                      <Send size={17} />
                    </button>
                  </form>
                </>
              ) : (
                <Empty
                  title={L("المحادثة غير متاحة", "Conversation unavailable")}
                />
              )}
            </Loadable>
          ) : (
            <Empty
              icon={Mail}
              title={L("اختر محادثة", "Choose a conversation")}
              body={L(
                "الرسائل تظهر بعد موافقة الطرفين ووجود مجتمع مشترك.",
                "Messages require consent and a shared community.",
              )}
            />
          )}
        </div>
      </div>
    </>
  );
}
function ChallengeReview({ id }) {
  const [t, L] = useText();
  const { setToast } = useApp();
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useData(
    `/admin/challenges/${id}/submissions`,
    refresh,
  );
  return (
    <Loadable loading={loading} error={error}>
      {data?.items?.length ? (
        data.items.map((s) => (
          <div className="admin-row" key={s.id}>
            <div>
              <strong>{s.User?.name}</strong>
              <p>{s.body}</p>
              <small>
                {s.status} {s.feedback}
              </small>
            </div>
            {s.status === "submitted" && (
              <button
                onClick={async () => {
                  const feedback =
                    window.prompt(L("ملاحظات المراجعة", "Review feedback")) ||
                    "";
                  try {
                    await api(`/admin/submissions/${s.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ feedback }),
                    });
                    setRefresh((x) => x + 1);
                    setToast(L("تمت المراجعة", "Reviewed"));
                  } catch (e) {
                    setToast(e.message);
                  }
                }}
              >
                {L("مراجعة", "Review")}
              </button>
            )}
          </div>
        ))
      ) : (
        <Empty
          icon={FileText}
          title={L(
            "لا توجد مشاركات لهذا التحدي",
            "No submissions for this challenge",
          )}
        />
      )}
    </Loadable>
  );
}
function ChallengesPage() {
  const [t, L] = useText();
  const { data, loading, error } = useData("/challenges");
  return (
    <>
      <AppHeading
        eyebrow={L("شارك وابنِ", "TAKE PART & BUILD")}
        title={L("التحديات", "Challenges")}
        description={L(
          "تحديات تنشرها إدارة المنصة. ساهم بحل، وتابع ملاحظات المراجعة.",
          "Challenges published by the platform. Contribute a solution and track feedback.",
        )}
      />
      <Loadable loading={loading} error={error}>
        {data?.items?.length ? (
          <div className="directory-grid">
            {data.items.map((c) => (
              <Link
                className="directory-card"
                to={`/challenges/${c.id}`}
                key={c.id}
              >
                <div className="directory-card-top">
                  <span className="directory-icon">
                    <Target size={23} />
                  </span>
                  <span className="directory-index">{c.Community?.nameEn}</span>
                </div>
                <h2>{c.title}</h2>
                <p>{c.description}</p>
                <div className="directory-meta">
                  <Clock size={15} />
                  {L("ينتهي", "Deadline")}{" "}
                  {new Date(c.deadline).toLocaleDateString()}
                </div>
                <span className="text-link">
                  {t.learnMore}
                  <ArrowUpLeft size={16} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            icon={Target}
            title={L(
              "لا توجد تحديات منشورة بعد",
              "No published challenges yet",
            )}
            body={L(
              "ستظهر التحديات التي تعتمدها الإدارة هنا.",
              "Approved challenges will appear here.",
            )}
          />
        )}
      </Loadable>
    </>
  );
}
function ChallengeDetail() {
  const { id } = useParams(),
    { user, setToast } = useApp();
  const [t, L] = useText();
  const [refresh, setRefresh] = useState(0),
    [body, setBody] = useState("");
  const { data, loading, error } = useData(`/challenges/${id}`, refresh);
  async function submit(e) {
    e.preventDefault();
    try {
      await api(`/challenges/${id}/submissions`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setToast(L("تم حفظ مشاركتك", "Submission saved"));
      setRefresh((x) => x + 1);
    } catch (err) {
      setToast(err.message);
    }
  }
  return (
    <>
      <AppHeading
        eyebrow={L("التحديات", "CHALLENGES")}
        title={data?.item?.title || L("تحدي المجتمع", "Community challenge")}
      />
      <div className="narrow-content">
        <Loadable loading={loading} error={error}>
          {data?.item ? (
            <div className="event-detail">
              <p>{data.item.description}</p>
              <div className="event-properties">
                <div>
                  <Users size={18} />
                  {data.item.Community?.nameEn}
                </div>
                <div>
                  <Clock size={18} />
                  {L("الموعد النهائي", "Deadline")}:{" "}
                  {new Date(data.item.deadline).toLocaleString()}
                </div>
              </div>
              {data.mine && (
                <div className="success-note">
                  <CheckCircle2 size={17} />
                  {L("مشاركتك محفوظة", "Your submission is saved")} ·{" "}
                  {data.mine.status}
                </div>
              )}
              {user ? (
                new Date(data.item.deadline) > new Date() ? (
                  <form
                    className="settings-form challenge-form"
                    onSubmit={submit}
                  >
                    <label>
                      {L(
                        "فكرتك أو حلك (٢٠ حرفًا على الأقل)",
                        "Your idea or solution (at least 20 characters)",
                      )}
                      <textarea
                        minLength="20"
                        maxLength="5000"
                        required
                        value={body || data.mine?.body || ""}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </label>
                    <button className="button button-accent">
                      {data.mine
                        ? L("تحديث مشاركتي", "Update submission")
                        : L("أرسل المشاركة", "Submit idea")}
                      <Send size={17} />
                    </button>
                  </form>
                ) : (
                  <p className="muted">
                    {L(
                      "انتهى موعد المشاركة.",
                      "The submission deadline has passed.",
                    )}
                  </p>
                )
              ) : (
                <Link className="button button-accent" to="/login">
                  {t.login}
                  <ArrowUpLeft size={17} />
                </Link>
              )}
            </div>
          ) : (
            <Empty title={L("التحدي غير متاح", "Challenge unavailable")} />
          )}
        </Loadable>
      </div>
    </>
  );
}
function MySubmissions() {
  const [t, L] = useText();
  const { data, loading, error } = useData("/my-submissions");
  return (
    <>
      <AppHeading
        eyebrow={L("مساهماتك", "YOUR CONTRIBUTIONS")}
        title={L("مشاركاتي", "My submissions")}
      />
      <Loadable loading={loading} error={error}>
        {data?.items?.length ? (
          data.items.map((s) => (
            <Link
              className="admin-row"
              to={`/challenges/${s.ChallengeId}`}
              key={s.id}
            >
              <div>
                <strong>{s.Challenge?.title}</strong>
                <p>{s.body}</p>
                <small>
                  {s.status} {s.feedback && `· ${s.feedback}`}
                </small>
              </div>
              <ArrowUpLeft size={19} />
            </Link>
          ))
        ) : (
          <Empty
            icon={FileText}
            title={L("لم تشارك في تحدٍّ بعد", "No submissions yet")}
            action={L("استكشف التحديات", "Explore challenges")}
            href="/challenges"
          />
        )}
      </Loadable>
    </>
  );
}
function MentorshipPage() {
  const [t, L] = useText();
  const { setToast } = useApp();
  const [refresh, setRefresh] = useState(0),
    [form, setForm] = useState({ expertise: "", availability: "" });
  const { data, loading, error } = useData("/mentorship", refresh);
  async function save(e) {
    e.preventDefault();
    try {
      await api("/mentors", { method: "POST", body: JSON.stringify(form) });
      setToast(
        L("ملف الإرشاد للمراجعة", "Mentor profile submitted for review"),
      );
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(e.message);
    }
  }
  async function decide(id, status) {
    await api(`/mentorship/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setRefresh((x) => x + 1);
  }
  return (
    <>
      <AppHeading
        eyebrow={L("الخبرة تتشارك", "SHARE EXPERIENCE")}
        title={L("الإرشاد", "Mentorship")}
        description={L(
          "طلباتك ومساحة مشاركة خبرتك مع الآخرين.",
          "Your requests and your space to share expertise.",
        )}
      />
      <Loadable loading={loading} error={error}>
        <div className="mentorship-grid">
          <div>
            <h2>{L("طلبات واردة", "Incoming requests")}</h2>
            {data?.incoming?.length ? (
              data.incoming.map((r) => (
                <div className="admin-row" key={r.id}>
                  <div>
                    <strong>{r.User?.name}</strong>
                    <p>{r.message}</p>
                    <small>{r.status}</small>
                  </div>
                  {r.status === "pending" && (
                    <div>
                      <button onClick={() => decide(r.id, "accepted")}>
                        {L("قبول", "Accept")}
                      </button>
                      <button onClick={() => decide(r.id, "declined")}>
                        {L("رفض", "Decline")}
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <Empty
                icon={Lightbulb}
                title={L("لا توجد طلبات واردة", "No incoming requests")}
              />
            )}
            <h2>{L("طلباتي", "My requests")}</h2>
            {data?.sent?.length ? (
              data.sent.map((r) => (
                <div className="admin-row" key={r.id}>
                  <div>
                    <strong>{r.Mentor?.User?.name}</strong>
                    <p>{r.message}</p>
                    <small>{r.status}</small>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                icon={Send}
                title={L("لم تطلب جلسة بعد", "No requests sent yet")}
                action={t.mentors}
                href="/mentors"
              />
            )}
          </div>
          <form className="settings-form" onSubmit={save}>
            <h2>{L("شارك خبرتك كمرشد", "Share expertise as a mentor")}</h2>
            {data?.mentor && (
              <div className="success-note">
                <Info size={17} />
                {data.mentor.published
                  ? L("ملفك منشور", "Your profile is published")
                  : L(
                      "ملفك ينتظر مراجعة الإدارة",
                      "Your profile awaits admin review",
                    )}
              </div>
            )}
            <label>
              {L("مجالات الخبرة", "Expertise")}
              <input
                required
                minLength="3"
                value={form.expertise || data?.mentor?.expertise || ""}
                onChange={(e) =>
                  setForm({ ...form, expertise: e.target.value })
                }
              />
            </label>
            <label>
              {L("أوقات التوفر", "Availability")}
              <input
                value={form.availability || data?.mentor?.availability || ""}
                onChange={(e) =>
                  setForm({ ...form, availability: e.target.value })
                }
              />
            </label>
            <button className="button button-accent">
              {L("أرسل للمراجعة", "Submit for review")}
              <ArrowUpLeft size={17} />
            </button>
          </form>
        </div>
      </Loadable>
    </>
  );
}
const Router = PREVIEW_MODE ? HashRouter : BrowserRouter;
createRoot(document.getElementById("root")).render(
  <Router>
    <AppProvider>
      <RouteApp />
    </AppProvider>
  </Router>,
);

function ResourcesPage() {
  const { lang } = useApp(),
    [t, L] = useText();
  const [persona, setPersona] = useState("all"),
    [query, setQuery] = useState("");
  const filtered = guides.filter(
    (g) =>
      (persona === "all" || g.persona === persona) &&
      [g.titleAr, g.titleEn, g.summaryAr, g.summaryEn]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <PageHero
        eyebrow={L("مكتبة العمل", "PRACTICAL LIBRARY")}
        title={L(
          "أدوات تبدأ بها خطوة حقيقية.",
          "Useful tools for your next step.",
        )}
        body={L(
          "أدلة أصلية قصيرة وقوالب عمل لكل مجتمع. اختر مسارك وطبّق فكرة واحدة اليوم.",
          "Short original guides and working templates for each community. Pick a path and put one idea to work.",
        )}
        icon={BookOpen}
      />
      <div className="wrap resource-area">
        <div className="resource-toolbar">
          <div
            className="resource-filters"
            aria-label={L("تصفية بحسب المجتمع", "Filter by community")}
          >
            <button
              className={persona === "all" ? "active" : ""}
              onClick={() => setPersona("all")}
            >
              {L("الكل", "All")}
            </button>
            {personaData.map((p) => (
              <button
                key={p.slug}
                className={persona === p.slug ? "active" : ""}
                onClick={() => setPersona(p.slug)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <label className="resource-search">
            <Search size={18} />
            <span className="sr-only">{t.search}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={L("ابحث في الأدلة", "Search guides")}
            />
          </label>
        </div>
        <div className="resource-count">
          {L(
            `${filtered.length} أدلة عملية`,
            `${filtered.length} practical guides`,
          )}
        </div>
        {filtered.length ? (
          <div className="resource-grid">
            {filtered.map((g, i) => (
              <Link
                to={`/resources/${g.slug}`}
                className="resource-card"
                key={g.slug}
              >
                <div className="resource-card-top">
                  <span>
                    {String(i + 1).padStart(2, "0")} /{" "}
                    {personaData.find((p) => p.slug === g.persona)?.name}
                  </span>
                  <BookOpen size={21} />
                </div>
                <span className="resource-kind">
                  {g.category === "template"
                    ? L("قالب عمل", "TEMPLATE")
                    : g.category === "plan"
                      ? L("خطة", "PLAN")
                      : L("دليل", "GUIDE")}{" "}
                  · {g.minutes} {L("دقائق", "MIN")}
                </span>
                <h2>{lang === "ar" ? g.titleAr : g.titleEn}</h2>
                <p>{lang === "ar" ? g.summaryAr : g.summaryEn}</p>
                <span className="resource-card-link">
                  {L("افتح الدليل", "Open guide")}
                  <ArrowUpLeft size={18} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            icon={Search}
            title={L("لا توجد نتائج بهذا البحث", "No guides match that search")}
            body={L(
              "جرّب كلمة أخرى أو اختر كل المجتمعات.",
              "Try another word or choose all communities.",
            )}
          />
        )}
      </div>
    </>
  );
}
function ResourceDetail() {
  const { slug } = useParams(),
    { lang } = useApp(),
    [t, L] = useText();
  const g = guides.find((x) => x.slug === slug);
  if (!g) return <NotFound />;
  const steps = lang === "ar" ? g.stepsAr : g.stepsEn;
  const related = guides.filter(
    (x) => x.persona === g.persona && x.slug !== g.slug,
  );
  return (
    <>
      <PageHero
        eyebrow={`${personaData.find((p) => p.slug === g.persona)?.name} / USAM GUIDES`}
        title={lang === "ar" ? g.titleAr : g.titleEn}
        body={lang === "ar" ? g.summaryAr : g.summaryEn}
        icon={BookOpen}
      />
      <div className="wrap resource-detail">
        <div className="resource-reading">
          <div className="reading-meta">
            <span>
              {g.minutes} {L("دقائق قراءة", "min read")}
            </span>
            <span>✳ {L("دليل عملي", "Practical guide")}</span>
          </div>
          <h2>{L("اشتغل عليها خطوة بخطوة", "Work through it step by step")}</h2>
          <ol>
            {steps.map(([title, body], i) => (
              <li key={title}>
                <span className="step-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="resource-output">
            <CheckCircle2 size={24} />
            <p>{lang === "ar" ? g.outputAr : g.outputEn}</p>
          </div>
          <div className="resource-actions">
            <Link
              className="button button-accent"
              to={`/communities/${g.persona}`}
            >
              {L("افتح المجتمع", "Open community")}
              <ArrowUpLeft size={17} />
            </Link>
            <Link className="button button-outline" to="/resources">
              {L("كل الأدلة", "All guides")}
              <BookOpen size={17} />
            </Link>
          </div>
        </div>
        <aside className="reading-aside">
          <span className="eyebrow">
            {L("دليل آخر لنفس المسار", "MORE FOR THIS PATH")}
          </span>
          {related.map((x) => (
            <Link to={`/resources/${x.slug}`} key={x.slug}>
              {lang === "ar" ? x.titleAr : x.titleEn}
              <ArrowUpLeft size={16} />
            </Link>
          ))}
          <div className="reading-note">
            {L(
              "هذه الأدلة أدوات للتعلم والتخطيط. لا تمثل وعدًا بتمويل أو توظيف أو شراكة.",
              "These are tools for learning and planning, not promises of funding, employment or partnership.",
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
const faqItems = [
  [
    "هل أقدر أنضم لأكثر من مجتمع؟",
    "نعم. حسابك واحد وتقدر تنضم لأي من المجتمعات الأربع حسب اهتماماتك.",
    "Can I join more than one community?",
    "Yes. One account can join any of the four communities.",
  ],
  [
    "هل ملفي ظاهر لكل الأعضاء؟",
    "لا. الظهور في دليل الأعضاء اختياري، وتفعّله بنفسك من الإعدادات.",
    "Is my profile visible to everyone?",
    "No. Member directory visibility is optional and controlled in settings.",
  ],
  [
    "من يستطيع نشر فعالية أو عرض؟",
    "في النسخة الحالية تنشر الإدارة الفعاليات المجانية والعروض بعد المراجعة.",
    "Who can publish an event or offer?",
    "In the current build, admins publish free events and reviewed offers.",
  ],
  [
    "كيف تتم الرسائل؟",
    "يشترط أن يسمح الطرفان بالرسائل، ويشتركا في مجتمع، وألا يحظر أحدهما الآخر.",
    "How do direct messages work?",
    "Both people must enable messages, share a community and have no active block.",
  ],
  [
    "هل التقديم للوظائف هنا؟",
    "الوظائف والتقديم الرسمي في USAM Career & Jobs. هنا روابط واضحة تساعدك على الانتقال.",
    "Do I apply for jobs here?",
    "Formal job applications are on USAM Career & Jobs. This site provides a clear route there.",
  ],
  [
    "هل الفعاليات المدفوعة متاحة؟",
    "التسجيل المجاني مدعوم. التذاكر المدفوعة تحتاج مزود دفع معتمد ولم تُفعّل بعد.",
    "Are paid tickets available?",
    "Free registration is supported. Paid tickets require a verified payment provider and are not enabled.",
  ],
  [
    "هل أقدر أبدأ فورًا؟",
    "نعم. أنشئ مساحتك، اختر مجتمعك، ثم شارك أو سجّل في فعالية. تحفظ النسخة المنشورة اختياراتك على جهازك الحالي.",
    "Can I start immediately?",
    "Yes. Create your space, choose a community, then post or register for an event. The hosted version keeps your choices on your current device.",
  ],
  [
    "إزاي أبلغ عن محتوى؟",
    "من المنشور نفسه استخدم زر الإبلاغ. الإدارة تراجع البلاغات قبل اتخاذ قرار.",
    "How do I report content?",
    "Use the report action on a post. Admins review reports before deciding.",
  ],
];
function FAQPage() {
  const { lang } = useApp(),
    [t, L] = useText();
  return (
    <>
      <PageHero
        eyebrow="USAM / HELP"
        title={L(
          "أسئلة مهمة، إجابات واضحة.",
          "Clear answers to common questions.",
        )}
        body={L(
          "افهم حدود المنصة وطريقة المشاركة قبل أن تبدأ.",
          "Understand how to participate and what each feature supports.",
        )}
        icon={Info}
      />
      <div className="wrap faq-layout">
        <div className="faq-intro">
          <span className="eyebrow">{L("ابدأ من هنا", "START HERE")}</span>
          <h2>{L("كل إجابة تفتح لك خطوة.", "Find your next step.")}</h2>
          <p>
            {L(
              "لو محتاج تفاصيل أكثر عن قواعد المشاركة والخصوصية، الصفحات المخصصة لها متاحة من أسفل الموقع.",
              "Find more detail in the community guidelines and privacy pages linked below.",
            )}
          </p>
          <Link to="/guidelines" className="text-link">
            {L("قواعد المجتمع", "Community guidelines")}
            <ArrowUpLeft size={16} />
          </Link>
        </div>
        <div className="faq-list">
          {faqItems.map((q, i) => (
            <details key={i}>
              <summary>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {lang === "ar" ? q[0] : q[2]}
                <Plus size={19} />
              </summary>
              <p>{lang === "ar" ? q[1] : q[3]}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
function ActivityPage() {
  const [t, L] = useText();
  const { data, loading, error } = useData("/activity");
  const labels = {
    join: [L("انضممت إلى مجتمع", "Joined a community"), Users],
    post: [L("نشرت فكرة أو سؤالًا", "Published a post"), MessageCircle],
    comment: [L("علّقت على منشور", "Commented on a post"), MessageCircle],
    event: [L("سجلت في فعالية", "Registered for an event"), CalendarDays],
    offer: [L("حصلت على ميزة", "Claimed a perk"), Gift],
  };
  return (
    <>
      <AppHeading
        eyebrow={L("رحلتك", "YOUR JOURNEY")}
        title={L("نشاطي", "My activity")}
        description={L(
          "أفعالك التي سجّلتها المنصة، في مكان واحد.",
          "Your recorded actions in one place.",
        )}
      />
      <div className="narrow-content">
        <Loadable loading={loading} error={error}>
          {data?.items?.length ? (
            <div className="activity-list">
              {data.items.map((x) => {
                const [label, Icon] = labels[x.kind] || [
                  L("نشاط", "Activity"),
                  Info,
                ];
                return (
                  <Link
                    to={x.href || "/home"}
                    className="activity-item"
                    key={x.id}
                  >
                    <span className="activity-icon">
                      <Icon size={20} />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>
                        {x.detail || ""} ·{" "}
                        {new Date(x.createdAt).toLocaleDateString()}
                      </small>
                    </span>
                    <ArrowUpLeft size={17} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty
              icon={ChartNoAxesCombined}
              title={L("رحلتك لسه بتبدأ", "Your journey starts here")}
              body={L(
                "انضم لمجتمع أو شارك منشورًا ليظهر نشاطك هنا.",
                "Join a community or share a post to see your activity here.",
              )}
              action={t.communities}
              href="/communities"
            />
          )}
        </Loadable>
      </div>
    </>
  );
}
function MyEventsPage() {
  const [t, L] = useText();
  const { setToast } = useApp();
  const { data, loading, error } = useData("/my-events");
  return (
    <>
      <AppHeading
        eyebrow={L("لقاءاتك", "YOUR GATHERINGS")}
        title={L("فعالياتي", "My events")}
        description={L(
          "تسجيلاتك الحالية وقائمة الانتظار في مكان واحد.",
          "Your registrations and waitlists in one place.",
        )}
      />
      <div className="narrow-content">
        <Loadable loading={loading} error={error}>
          {data?.items?.length ? (
            <div className="activity-list">
              {data.items.map((x) => (
                <div className="activity-item" key={x.id}>
                  <span className="activity-icon">
                    <CalendarDays size={21} />
                  </span>
                  <Link to={`/events/${x.Event?.id}`}>
                    <strong>{x.Event?.title}</strong>
                    <small>
                      {new Date(x.Event?.startsAt).toLocaleString()} ·{" "}
                      {x.status === "waitlisted"
                        ? L("قائمة انتظار", "Waitlist")
                        : x.status === "pending_payment"
                          ? L("بانتظار الدفع", "Awaiting payment")
                          : L("مسجّل", "Registered")}
                    </small>
                  </Link>
                  {x.status === "registered" && (
                    <button
                      className="button-reset text-link"
                      onClick={async () => {
                        try {
                          const result = await api(
                            `/events/${x.Event?.id}/ticket`,
                          );
                          setToast(
                            `${L("كود الدخول", "Check-in code")}: ${result.ticket.code}`,
                          );
                        } catch (e) {
                          setToast(e.message);
                        }
                      }}
                    >
                      {L("عرض التذكرة", "View ticket")}
                      <BadgeCheck size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={CalendarDays}
              title={L("لا توجد تسجيلات بعد", "No registrations yet")}
              action={t.events}
              href="/events"
            />
          )}
        </Loadable>
      </div>
    </>
  );
}
function ContactPage() {
  const [t, L] = useText(),
    [form, setForm] = useState({
      name: "",
      email: "",
      topic: "general",
      message: "",
      website: "",
    });
  const [reference, setReference] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api("/contact", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setReference(result.reference);
      setForm({
        name: "",
        email: "",
        topic: "general",
        message: "",
        website: "",
      });
    } catch (e) {
      setError(
        e.message === "too_many_requests"
          ? L("محاولات كثيرة، جرّب لاحقًا.", "Too many attempts, try later.")
          : L(
              "راجع البيانات وحاول مرة أخرى.",
              "Check the fields and try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHero
        eyebrow={L("تواصل معنا", "GET IN TOUCH")}
        title={L("قول لنا إزاي نقدر نساعد.", "Tell us how we can help.")}
        body={L(
          "استفسار عن المنصة، شراكة محتملة، أو طلب مساعدة. اكتب تفاصيل واضحة ليصل الطلب للإدارة.",
          "Questions about the platform, a possible partnership or a support request. Give enough detail for the team to review.",
        )}
        icon={Mail}
      />
      <div className="wrap contact-layout">
        <div className="contact-side">
          <span className="eyebrow">{L("قبل الإرسال", "BEFORE YOU SEND")}</span>
          <h2>{L("اختَر الموضوع المناسب.", "Choose the right topic.")}</h2>
          <p>
            {L(
              "لو سؤالك عن استخدام المنصة، جرّب الأسئلة الشائعة. أما طلبات الشراكة والخصوصية فتدخل مسار المراجعة.",
              "For how-to questions, start with the FAQ. Partnership and privacy requests enter the review workflow.",
            )}
          </p>
          <Link to="/faq" className="text-link">
            {L("اقرأ الأسئلة الشائعة", "Read the FAQ")}
            <ArrowUpLeft size={16} />
          </Link>
          <div className="contact-note">
            <Info size={18} />
            <span>
              {PREVIEW_MODE
                ? L(
                    "في النسخة المنشورة يُحفظ الطلب ورقم المرجع على جهازك الحالي. للإرسال التشغيلي استخدم قناة USAM الرسمية حتى يكتمل ربط الخادم.",
                    "On the hosted version, the request and reference stay on this device. Use the official USAM channel for operational delivery until the server is connected.",
                  )
                : L(
                    "بعد الإرسال يظهر رقم مرجع يمكنك الاحتفاظ به للمتابعة.",
                    "After submission, keep the reference number for follow-up.",
                  )}
            </span>
          </div>
        </div>
        <div className="contact-panel">
          {reference ? (
            <div className="contact-success" role="status">
              <CheckCircle2 size={37} />
              <h2>
                {PREVIEW_MODE
                  ? L(
                      "تم حفظ الطلب على جهازك.",
                      "Request saved on this device.",
                    )
                  : L("تم استلام طلبك.", "Request received.")}
              </h2>
              <p>
                {L("رقم المرجع", "Reference")}:{" "}
                <strong dir="ltr">{reference}</strong>
              </p>
              <button
                className="button button-outline"
                onClick={() => setReference("")}
              >
                {L("اكتب طلبًا آخر", "Write another request")}
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="form-columns">
                <label>
                  {L("الاسم", "Name")}
                  <input
                    required
                    minLength="2"
                    maxLength="100"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <label>
                  {L("البريد الإلكتروني", "Email")}
                  <input
                    required
                    type="email"
                    maxLength="254"
                    dir="ltr"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                {L("الموضوع", "Topic")}
                <select
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                >
                  <option value="general">
                    {L("استفسار عام", "General question")}
                  </option>
                  <option value="partnership">
                    {L("شراكة محتملة", "Potential partnership")}
                  </option>
                  <option value="support">
                    {L("مساعدة في استخدام المنصة", "Platform support")}
                  </option>
                  <option value="privacy">
                    {L("خصوصية وبيانات", "Privacy and data")}
                  </option>
                </select>
              </label>
              <label>
                {L("التفاصيل", "Details")}
                <textarea
                  required
                  minLength="20"
                  maxLength="3000"
                  value={form.message}
                  onChange={(e) =>
                    setForm({ ...form, message: e.target.value })
                  }
                  placeholder={L(
                    "اكتب السياق والخطوة التي تحتاجها…",
                    "Share the context and what help you need…",
                  )}
                />
              </label>
              <label className="contact-honeypot" aria-hidden="true">
                Website
                <input
                  tabIndex="-1"
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) =>
                    setForm({ ...form, website: e.target.value })
                  }
                />
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button className="button button-accent" disabled={busy}>
                {busy
                  ? L("جارٍ الحفظ…", "Saving…")
                  : L("إرسال الطلب", "Send request")}
                <ArrowUpLeft size={17} />
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function ExperienceCatalog({ type }) {
  const { lang, user } = useApp(),
    [t, L] = useText();
  const config = {
    programs: {
      items: programs,
      icon: Target,
      eyebrow: L("مسارات تطبيقية", "PRACTICAL PATHWAYS"),
      title: L(
        "برامج تحوّل المعرفة إلى حركة.",
        "Programs that turn insight into action.",
      ),
      body: L(
        "مسارات قصيرة مرتبطة بكل مجتمع، لها مخرجات واضحة وخطوات قابلة للتطبيق.",
        "Short pathways for each community, with clear outputs and practical steps.",
      ),
    },
    rooms: {
      items: rooms,
      icon: Layers,
      eyebrow: L("لقاءات منسقة", "CURATED CONNECTIONS"),
      title: L(
        "غرف صغيرة لمحادثات أعمق.",
        "Small rooms for deeper conversations.",
      ),
      body: L(
        "طلب مشاركة، مراجعة بشرية، جلسة ميسّرة، ثم متابعة تحترم موافقة كل عضو.",
        "Apply, receive a human review, join a facilitated session, then follow up with member consent.",
      ),
    },
    partners: {
      items: partners,
      icon: Handshake,
      eyebrow: L("اصنع أثرًا معنا", "BUILD WITH US"),
      title: L("شراكات لها دور واضح.", "Partnerships with a clear purpose."),
      body: L(
        "نماذج تعاون محددة تبدأ بطلب وتقييم بشري قبل أي نشر أو تفعيل.",
        "Defined collaboration models that begin with a request and human review before activation.",
      ),
    },
  }[type];
  const Icon = config.icon;
  return (
    <>
      <PageHero
        eyebrow={config.eyebrow}
        title={config.title}
        body={config.body}
        icon={Icon}
      />
      <div className="wrap experience-grid">
        {config.items.map((item, i) => {
          const persona = personaData.find((p) => p.slug === item.persona);
          return (
            <article
              className={`experience-card ${persona?.color || ""}`}
              key={item.id}
            >
              <div className="experience-index">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <Icon size={23} />
              </div>
              {persona && <span className="resource-kind">{persona.name}</span>}
              <h2>{lang === "ar" ? item.titleAr : item.titleEn}</h2>
              <p>{lang === "ar" ? item.summaryAr : item.summaryEn}</p>
              <div className="experience-meta">
                {type === "programs"
                  ? lang === "ar"
                    ? item.lengthAr
                    : item.lengthEn
                  : type === "rooms"
                    ? lang === "ar"
                      ? item.formatAr
                      : item.formatEn
                    : L("طلب ومراجعة وتفعيل", "Request · review · activation")}
              </div>
              <Link
                className="text-link"
                to={
                  user
                    ? type === "partners"
                      ? "/contact"
                      : `/communities/${item.persona || "launchpad"}`
                    : "/signup"
                }
              >
                {type === "partners"
                  ? L("قدّم طلب شراكة", "Start a partnership request")
                  : type === "rooms"
                    ? L("اطلب المشاركة", "Apply to join")
                    : L("ابدأ من مجتمعك", "Start in your community")}
                <ArrowUpLeft size={16} />
              </Link>
            </article>
          );
        })}
      </div>
      <section className="wrap experience-flow">
        <div>
          <span>01</span>
          <strong>{L("اختَر", "Choose")}</strong>
          <p>
            {L(
              "برنامجًا أو غرفة مرتبطة بهدفك الحالي.",
              "A program or room relevant to your current goal.",
            )}
          </p>
        </div>
        <div>
          <span>02</span>
          <strong>{L("شارك السياق", "Share context")}</strong>
          <p>
            {L(
              "أكمل ملفك وحدد ما تحتاجه وما يمكنك تقديمه.",
              "Complete your profile and explain what you need and can contribute.",
            )}
          </p>
        </div>
        <div>
          <span>03</span>
          <strong>{L("ابدأ بخطوة", "Take a step")}</strong>
          <p>
            {L(
              "انضم أو قدّم طلبًا ثم تابع النتيجة من مساحتك.",
              "Join or apply, then track the outcome from your space.",
            )}
          </p>
        </div>
      </section>
    </>
  );
}

function formatEgp(value, lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function PricingPage() {
  const { lang } = useApp(),
    [t, L] = useText(),
    { data, loading, error } = useData("/plans"),
    [cycle, setCycle] = useState("yearly");
  return (
    <>
      <PageHero
        eyebrow={L("عضوية مرنة", "FLEXIBLE MEMBERSHIP")}
        title={L(
          "ابدأ مجانًا. وارتقِ عندما تحتاج أكثر.",
          "Start free. Upgrade when you need more.",
        )}
        body={L(
          "أربع خطط واضحة للأفراد والمؤسسات. السنوي يساوي عشرة أشهر، والأسعار المعروضة بالجنيه المصري ولا يتم تحصيل أي مبلغ قبل تأكيد الدفع.",
          "Four clear plans for individuals and organizations. Annual billing equals ten monthly payments, all prices are in Egyptian pounds, and nothing is charged before payment confirmation.",
        )}
        icon={CreditCard}
      />
      <div
        className="wrap pricing-toolbar"
        role="group"
        aria-label={L("دورة الفوترة", "Billing cycle")}
      >
        <button
          className={cycle === "monthly" ? "active" : ""}
          onClick={() => setCycle("monthly")}
        >
          {L("شهري", "Monthly")}
        </button>
        <button
          className={cycle === "yearly" ? "active" : ""}
          onClick={() => setCycle("yearly")}
        >
          {L("سنوي", "Annual")}{" "}
          <span>{L("شهران ضمن الخطة", "2 months included")}</span>
        </button>
      </div>
      <div className="wrap">
        <Loadable loading={loading} error={error}>
          <div className="pricing-grid">
            {(data?.items || []).map((plan) => {
              const amount =
                cycle === "yearly" ? plan.yearlyEgp : plan.monthlyEgp;
              const features =
                lang === "ar" ? plan.featuresAr : plan.featuresEn;
              return (
                <article
                  className={`pricing-card ${plan.featured ? "featured" : ""}`}
                  key={plan.code}
                >
                  {plan.featured && (
                    <span className="pricing-badge">
                      {L("الأنسب للبدء", "Best place to start")}
                    </span>
                  )}
                  <span className="resource-kind">
                    {plan.audience === "organization"
                      ? L("للمؤسسات", "FOR ORGANIZATIONS")
                      : L("للأفراد", "FOR INDIVIDUALS")}
                  </span>
                  <h2>{lang === "ar" ? plan.nameAr : plan.nameEn}</h2>
                  <p>
                    {lang === "ar" ? plan.descriptionAr : plan.descriptionEn}
                  </p>
                  <div className="price-line">
                    <strong>{formatEgp(amount, lang)}</strong>
                    <span>
                      {amount
                        ? cycle === "yearly"
                          ? L("/ سنة", "/ year")
                          : L("/ شهر", "/ month")
                        : L("دائمًا", "forever")}
                    </span>
                  </div>
                  {cycle === "yearly" && amount > 0 && (
                    <small>
                      {L(
                        `توفر ${formatEgp(plan.monthlyEgp * 2, lang)} سنويًا`,
                        `Save ${formatEgp(plan.monthlyEgp * 2, lang)} a year`,
                      )}
                    </small>
                  )}
                  <ul>
                    {features.map((feature) => (
                      <li key={feature}>
                        <Check size={17} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={`button ${plan.featured ? "button-accent" : "button-outline"}`}
                    to={`/checkout/${plan.code}?cycle=${cycle}`}
                  >
                    {amount
                      ? L("اختَر الخطة", "Choose plan")
                      : L("ابدأ مجانًا", "Start free")}
                    <ArrowUpLeft size={17} />
                  </Link>
                </article>
              );
            })}
          </div>
        </Loadable>
      </div>
      <section className="wrap pricing-notes">
        <div>
          <Shield size={22} />
          <strong>{L("دفع آمن خارج المنصة", "Hosted secure payment")}</strong>
          <p>
            {L(
              "عند التفعيل التجاري سينتقل الدفع إلى Paymob؛ لا نخزن بيانات البطاقات.",
              "When live billing is enabled, payment is handled by Paymob; card data is never stored here.",
            )}
          </p>
        </div>
        <div>
          <RefreshCcw size={22} />
          <strong>{L("إلغاء واضح", "Clear cancellation")}</strong>
          <p>
            {L(
              "يمكن إيقاف التجديد من صفحة الفوترة مع بقاء المزايا حتى نهاية الفترة المسددة.",
              "Stop renewal from billing and keep benefits until the paid period ends.",
            )}
          </p>
        </div>
        <div>
          <Handshake size={22} />
          <strong>{L("خطط المؤسسات", "Organization plans")}</strong>
          <p>
            {L(
              "يُراجع حساب المؤسسة ومقاعد الفريق قبل التفعيل للحفاظ على جودة المجتمع.",
              "Organization identity and team seats are reviewed before activation.",
            )}
          </p>
        </div>
      </section>
    </>
  );
}

function couponErrorText(code, L) {
  return (
    {
      coupon_invalid: L("الكود غير صحيح أو غير مفعّل", "This code is not valid"),
      coupon_expired: L("انتهت صلاحية هذا الكود", "This code has expired"),
      coupon_not_started: L("هذا الكود لم يبدأ بعد", "This code is not active yet"),
      coupon_not_applicable: L("الكود لا ينطبق على هذا الاختيار", "This code doesn't apply to this choice"),
      coupon_exhausted: L("تم استخدام هذا الكود بالكامل", "This code has been fully used"),
      coupon_already_used: L("استخدمت هذا الكود من قبل", "You have already used this code"),
      coupon_changed: L("تغيّر الكود، طبّقه مرة أخرى", "The code changed, apply it again"),
      too_many_requests: L("محاولات كثيرة، حاول لاحقًا", "Too many attempts, try again later"),
    }[code] || code
  );
}
// Promo code input used by plan checkout and paid event tickets.
function CouponField({ value, onChange, onApply, onRemove, applied, error, busy }) {
  const [, L] = useText();
  const { lang } = useApp();
  if (applied)
    return (
      <div className="coupon-applied" role="status">
        <BadgeCheck size={18} />
        <span>
          <strong>{applied.code}</strong>
          {applied.description ? ` · ${applied.description}` : ""} · −{formatEgp(applied.discountEgp, lang)}
        </span>
        <button type="button" className="text-link button-reset" onClick={onRemove}>
          {L("إزالة", "Remove")}
        </button>
      </div>
    );
  return (
    <form className="coupon-field" onSubmit={onApply}>
      <label>
        {L("كود الخصم", "Promo code")}
        <span className="coupon-row">
          <input
            dir="ltr"
            maxLength="40"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="WELCOME20"
          />
          <button className="button button-outline" disabled={busy || !value.trim()}>
            {busy ? "…" : L("تطبيق", "Apply")}
          </button>
        </span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function CheckoutPage() {
  const { planCode } = useParams(),
    location = useLocation(),
    navigate = useNavigate(),
    { lang, setToast } = useApp(),
    [t, L] = useText(),
    { data, loading, error } = useData("/plans"),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    // One key per page visit: a double-click or retry replays the SAME payment
    // instead of creating a second one (server dedupes on this key).
    [idempotencyKey] = useState(() => crypto.randomUUID()),
    [couponInput, setCouponInput] = useState(""),
    [coupon, setCoupon] = useState(null),
    [couponError, setCouponError] = useState(""),
    [checkingCoupon, setCheckingCoupon] = useState(false);
  const cycle =
    new URLSearchParams(location.search).get("cycle") === "monthly"
      ? "monthly"
      : "yearly";
  const plan = data?.items?.find((x) => x.code === planCode);
  async function applyCoupon(e) {
    e.preventDefault();
    if (!couponInput.trim() || !plan) return;
    setCheckingCoupon(true);
    setCouponError("");
    try {
      const q = await api("/coupons/quote", {
        method: "POST",
        body: JSON.stringify({ code: couponInput.trim(), planCode: plan.code, billingCycle: cycle }),
      });
      setCoupon(q);
    } catch (err) {
      setCoupon(null);
      setCouponError(couponErrorText(err.message, L));
    } finally {
      setCheckingCoupon(false);
    }
  }
  async function submit() {
    if (!accepted || !plan) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/subscriptions", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          planCode: plan.code,
          billingCycle: cycle,
          ...(coupon ? { couponCode: coupon.code } : {}),
        }),
      });
      if (result.status === "active") {
        // A 100% promo code: active immediately, nothing to pay.
        setToast(L("تم تفعيل عضويتك", "Your membership is active"));
        navigate("/billing", { replace: true });
        return;
      }
      // Paid plan with a live provider: send the member to the hosted payment
      // page. Nothing is activated here; only the server (after a verified
      // provider callback) can activate a paid plan.
      if (result.status === "pending_payment" && result.checkout?.checkoutUrl) {
        window.location.assign(result.checkout.checkoutUrl);
        return;
      }
      if (result.status === "pending_payment") {
        setToast(
          result.checkout?.error
            ? L(
                "تعذر فتح صفحة الدفع الآن. جرّب من صفحة الفوترة.",
                "Could not open the payment page right now. Retry from Billing.",
              )
            : L(
                "تم حفظ طلبك. الدفع الإلكتروني غير مفعّل بعد.",
                "Request saved. Online payment is not active yet.",
              ),
        );
      } else {
        setToast(L("تم تفعيل خطتك المجانية", "Your free plan is active"));
      }
      navigate("/billing", { replace: true });
    } catch (e) {
      if (e.message.startsWith("coupon_")) {
        setCoupon(null);
        setCouponError(couponErrorText(e.message, L));
        return;
      }
      setMessage(
        e.message === "idempotency_key_required"
          ? L(
              "تعذر إنشاء مرجع آمن. حاول مرة أخرى.",
              "Could not create a secure reference. Try again.",
            )
          : e.message === "email_verification_required"
            ? L(
                "وثّق بريدك الإلكتروني أولًا من الإعدادات.",
                "Please verify your email first (Settings).",
              )
            : t.error,
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading || error || !plan)
    return (
      <Loadable
        loading={loading}
        error={error || (!loading && !plan ? "not_found" : null)}
      />
    );
  const listAmount = cycle === "yearly" ? plan.yearlyEgp : plan.monthlyEgp;
  const amount = coupon ? coupon.finalEgp : listAmount;
  return (
    <div className="checkout-page">
      <AppHeading
        eyebrow={L("تأكيد الخطة", "CONFIRM PLAN")}
        title={L(
          "راجع اختيارك قبل المتابعة.",
          "Review your choice before continuing.",
        )}
        description={L(
          "لن نطلب أو نخزن بيانات بطاقة داخل هذه الصفحة.",
          "This page never asks for or stores card details.",
        )}
      />
      <div className="checkout-grid">
        <section className="checkout-summary">
          <span className="resource-kind">{plan.code.toUpperCase()}</span>
          <h2>{lang === "ar" ? plan.nameAr : plan.nameEn}</h2>
          <p>{lang === "ar" ? plan.descriptionAr : plan.descriptionEn}</p>
          <div className="checkout-total">
            <span>
              {cycle === "yearly"
                ? L("اشتراك سنوي", "Annual membership")
                : L("اشتراك شهري", "Monthly membership")}
            </span>
            <strong>
              {coupon && <s className="muted">{formatEgp(listAmount, lang)}</s>}{" "}
              {formatEgp(amount, lang)}
            </strong>
          </div>
          {listAmount > 0 && (
            <CouponField
              value={couponInput}
              onChange={setCouponInput}
              onApply={applyCoupon}
              onRemove={() => {
                setCoupon(null);
                setCouponInput("");
              }}
              applied={coupon}
              error={couponError}
              busy={checkingCoupon}
            />
          )}
          <Link className="text-link" to="/pricing">
            {L("غيّر الخطة", "Change plan")}
            <ArrowUpLeft size={16} />
          </Link>
        </section>
        <section className="checkout-confirm">
          <BadgeCheck size={30} />
          <h3>
            {amount
              ? L("طلب تفعيل مدفوع", "Paid activation request")
              : L("تفعيل مجاني", "Free activation")}
          </h3>
          <p>
            {amount
              ? L(
                  "ستنتقل إلى صفحة دفع آمنة لدى Paymob. لا نطلب ولا نخزن بيانات بطاقتك، ولا تُفعَّل العضوية إلا بعد تأكيد الدفع من المزود.",
                  "You'll be taken to Paymob's secure payment page. We never see or store your card, and membership activates only after the provider confirms payment.",
                )
              : L(
                  "يمكنك استخدام الخطة المجانية فورًا والانتقال لخطة أخرى لاحقًا.",
                  "Use the free plan immediately and upgrade later.",
                )}
          </p>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              {L(
                "قرأت الشروط وسياسة الإلغاء وأوافق عليهما.",
                "I have read and accept the terms and cancellation policy.",
              )}
            </span>
          </label>
          <div className="checkout-links">
            <Link to="/terms">{L("الشروط", "Terms")}</Link>
            <Link to="/refund-policy">
              {L("الإلغاء والاسترداد", "Cancellation & refunds")}
            </Link>
          </div>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <button
            className="button button-accent"
            disabled={!accepted || busy}
            onClick={submit}
          >
            {busy
              ? t.loading
              : amount
                ? L("المتابعة إلى الدفع", "Continue to payment")
                : coupon
                  ? L("فعّل العضوية بالكود", "Activate with this code")
                  : L("فعّل الخطة المجانية", "Activate free plan")}
            <ArrowUpLeft size={17} />
          </button>
        </section>
      </div>
    </div>
  );
}

function BillingPage() {
  const { lang, setToast } = useApp(),
    [t, L] = useText(),
    [refresh, setRefresh] = useState(0),
    { data, loading, error } = useData("/billing", refresh),
    history = useData("/payments/mine", refresh),
    [busy, setBusy] = useState(false),
    [resuming, setResuming] = useState(false),
    returnedFromPayment =
      new URLSearchParams(useLocation().search).get("payment") === "return";
  // After Paymob redirects back, the URL says nothing we can trust. Poll OUR
  // server (which only changes state after a signature-verified webhook) for
  // up to ~1 minute until the subscription flips from pending to active.
  useEffect(() => {
    if (!returnedFromPayment || data?.subscription?.status !== "pending_payment")
      return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      setRefresh((x) => x + 1);
      if (tries >= 20) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [returnedFromPayment, data?.subscription?.status]);
  async function cancel() {
    setBusy(true);
    try {
      const r = await api("/subscriptions/current", { method: "DELETE" });
      setToast(
        r.cancelsAt
          ? L(
              `ستبقى عضويتك فعّالة حتى ${new Date(r.cancelsAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}`,
              `Your membership stays active until ${new Date(r.cancelsAt).toLocaleDateString()}`,
            )
          : L("تم إلغاء الخطة الحالية", "Current plan canceled"),
      );
      setRefresh((x) => x + 1);
    } catch (e) {
      setToast(
        e.message === "no_active_subscription"
          ? L("لا توجد خطة نشطة", "No active plan")
          : t.error,
      );
    } finally {
      setBusy(false);
    }
  }
  async function resumeCheckout() {
    setResuming(true);
    try {
      const attemptId = history.data?.items?.find(
        (p) => ["created", "pending"].includes(p.status),
      )?.id;
      if (!attemptId) throw new Error("payment_attempt_not_found");
      const r = await api(`/payments/checkout/${attemptId}`, { method: "POST" });
      if (r.checkoutUrl) window.location.assign(r.checkoutUrl);
      else
        setToast(
          L(
            "الدفع الإلكتروني غير مفعّل بعد.",
            "Online payment is not active yet.",
          ),
        );
    } catch (e) {
      setToast(t.error);
    } finally {
      setResuming(false);
    }
  }
  return (
    <div className="billing-page">
      <AppHeading
        eyebrow={L("الفوترة", "BILLING")}
        title={L("خطتك واشتراكك.", "Your plan and membership.")}
        description={L(
          "راجع الحالة، دورة الفوترة، وسياسة الإلغاء من مكان واحد.",
          "Review status, billing cycle and cancellation in one place.",
        )}
        action={
          <Link className="button button-outline" to="/pricing">
            {L("عرض الخطط", "View plans")}
          </Link>
        }
      />
      <Loadable loading={loading} error={error}>
        {!data?.subscription ? (
          <Empty
            icon={CreditCard}
            title={L("لم تختَر خطة بعد", "No plan selected yet")}
            body={L(
              "ابدأ بالخطة المجانية أو اختر عضوية مدفوعة تناسب مرحلتك.",
              "Start free or choose a paid membership that fits your stage.",
            )}
            action={L("عرض الاشتراكات", "View pricing")}
            href="/pricing"
          />
        ) : (
          <div className="billing-card">
            <div className="billing-plan">
              <BadgeCheck size={28} />
              <div>
                <span>{L("الخطة الحالية", "CURRENT PLAN")}</span>
                <h2>
                  {lang === "ar"
                    ? data.subscription.plan.nameAr
                    : data.subscription.plan.nameEn}
                </h2>
              </div>
            </div>
            <div className="billing-status">
              <span className={`status-pill ${data.subscription.status}`}>
                {{
                  free: L("مجانية نشطة", "Free active"),
                  active: L("نشطة", "Active"),
                  pending_payment: L(
                    "بانتظار تأكيد الدفع",
                    "Payment confirmation pending",
                  ),
                  canceled: L("ملغاة", "Canceled"),
                  expired: L("منتهية", "Expired"),
                }[data.subscription.status] || data.subscription.status}
              </span>
              <strong>{formatEgp(data.subscription.amountEgp, lang)}</strong>
              <small>
                {data.subscription.billingCycle === "yearly"
                  ? L("سنوي", "Annual")
                  : L("شهري", "Monthly")}
              </small>
            </div>
            {data.subscription.status === "pending_payment" && (
              <div className="billing-alert">
                <Info size={19} />
                <p>
                  {returnedFromPayment
                    ? L(
                        "نتأكد من الدفع مع Paymob… ستتفعّل عضويتك تلقائيًا فور التأكيد.",
                        "Confirming your payment with Paymob… your membership activates automatically once confirmed.",
                      )
                    : data.paymentsConfigured
                      ? L(
                          "لم يكتمل الدفع بعد. أكمل الدفع لتفعيل عضويتك.",
                          "Payment is not complete yet. Finish paying to activate your membership.",
                        )
                      : L(
                          "لم يتم تحصيل أي مبلغ. الدفع الإلكتروني غير مفعّل حاليًا؛ سيؤكد فريقنا الدفع يدويًا بعد التحقق.",
                          "Nothing has been charged. Online payment is not active right now; our team confirms payment manually after verification.",
                        )}
                </p>
                {data.paymentsConfigured && (
                  <button
                    className="button button-accent"
                    disabled={resuming}
                    onClick={resumeCheckout}
                  >
                    {resuming ? t.loading : L("أكمل الدفع", "Complete payment")}
                  </button>
                )}
              </div>
            )}
            {data.subscription.status === "active" && data.subscription.endsAt && (
              <p className="muted">
                {data.subscription.cancelsAt
                  ? L(
                      `أُلغي التجديد. تبقى عضويتك فعّالة حتى ${new Date(data.subscription.endsAt).toLocaleDateString("ar-EG")}.`,
                      `Cancelled. Your membership stays active until ${new Date(data.subscription.endsAt).toLocaleDateString()}.`,
                    )
                  : L(
                      `تنتهي الفترة الحالية في ${new Date(data.subscription.endsAt).toLocaleDateString("ar-EG")}.`,
                      `Current term ends ${new Date(data.subscription.endsAt).toLocaleDateString()}.`,
                    )}
              </p>
            )}
            {["free", "active", "pending_payment"].includes(
              data.subscription.status,
            ) &&
              !data.subscription.cancelsAt && (
                <button
                  className="button button-outline danger"
                  disabled={busy}
                  onClick={cancel}
                >
                  {busy
                    ? t.loading
                    : data.subscription.status === "active" &&
                        data.subscription.endsAt
                      ? L("إلغاء التجديد", "Cancel at end of term")
                      : L("إلغاء الخطة", "Cancel plan")}
                </button>
              )}
          </div>
        )}
      </Loadable>
      {history.data?.items?.length > 0 && (
        <section className="settings-form" style={{ marginTop: 24 }}>
          <h2>{L("سجل المدفوعات", "Payment history")}</h2>
          <div className="sessions-list">
            {history.data.items.map((p) => (
              <div className="session-row" key={p.id}>
                <div>
                  <strong>
                    {p.plan ? (
                      lang === "ar" ? p.plan.nameAr : p.plan.nameEn
                    ) : p.event ? (
                      <Link to={`/events/${p.event.id}`}>
                        {L("تذكرة", "Ticket")}: {p.event.title}
                      </Link>
                    ) : (
                      "—"
                    )}{" "}
                    · {formatEgp(p.amountEgp, lang)}
                  </strong>
                  <small>
                    {new Date(p.createdAt).toLocaleString()} ·{" "}
                    {{
                      paid: L("مدفوعة", "Paid"),
                      pending: L("قيد الانتظار", "Pending"),
                      created: L("قيد الانتظار", "Pending"),
                      failed: L("فشلت", "Failed"),
                      refunded: L("مستردة", "Refunded"),
                      canceled: L("ملغاة", "Canceled"),
                    }[p.status] || p.status}
                    {p.refundedAmountEgp > 0 &&
                      ` · ${L("مسترد", "refunded")} ${formatEgp(p.refundedAmountEgp, lang)}`}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

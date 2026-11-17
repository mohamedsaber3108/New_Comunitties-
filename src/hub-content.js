export const programs = [
  {
    id: "founder-readiness",
    persona: "launchpad",
    titleAr: "جاهزية المؤسس",
    titleEn: "Founder Readiness",
    lengthAr: "٤ أسابيع",
    lengthEn: "4 weeks",
    summaryAr:
      "مسار عملي لتحويل الفكرة إلى فرضيات واختبارات ومحادثات عملاء قابلة للقياس.",
    summaryEn:
      "Turn an idea into testable assumptions, customer conversations and measurable next steps.",
    status: "open",
  },
  {
    id: "freelance-proof",
    persona: "freelancespace",
    titleAr: "دليل الخبرة للمستقل",
    titleEn: "Freelance Proof",
    lengthAr: "٣ أسابيع",
    lengthEn: "3 weeks",
    summaryAr:
      "ابنِ دراسة حالة واضحة، وحدد عرضك، ودرّب نفسك على إدارة بداية المشروع.",
    summaryEn:
      "Build a clear case study, shape your offer and practice a strong project kickoff.",
    status: "open",
  },
  {
    id: "people-ops-lab",
    persona: "hrconnect",
    titleAr: "مختبر تجربة الموظف",
    titleEn: "People Operations Lab",
    lengthAr: "٤ لقاءات",
    lengthEn: "4 sessions",
    summaryAr:
      "مختبر لأصحاب العمل لبناء Scorecards ومقابلات منظمة وتجربة ترشيح أفضل.",
    summaryEn:
      "A lab for role scorecards, structured interviews and a stronger candidate experience.",
    status: "upcoming",
  },
  {
    id: "campus-to-career",
    persona: "studentzone",
    titleAr: "من الجامعة إلى أول خطوة",
    titleEn: "Campus to Career",
    lengthAr: "٥ أسابيع",
    lengthEn: "5 weeks",
    summaryAr:
      "مشروعات قصيرة وتغذية راجعة تساعد الطالب على إظهار قدراته والاستعداد لأول فرصة.",
    summaryEn:
      "Short projects and feedback that help students show their strengths and prepare for a first opportunity.",
    status: "open",
  },
];

export const rooms = [
  {
    id: "founder-customer-room",
    persona: "launchpad",
    titleAr: "غرفة اكتشاف العميل",
    titleEn: "Customer Discovery Room",
    formatAr: "٨ أعضاء · ميسّر واحد",
    formatEn: "8 members · 1 facilitator",
    summaryAr:
      "جلسة صغيرة لمراجعة أسئلة المقابلات وتجميع الإشارات المتكررة دون مشاركة بيانات حساسة.",
    summaryEn:
      "A small facilitated session to refine interview questions and compare recurring signals without sharing sensitive data.",
  },
  {
    id: "portfolio-critique-room",
    persona: "freelancespace",
    titleAr: "غرفة مراجعة الملفات",
    titleEn: "Portfolio Critique Room",
    formatAr: "٦ أعضاء · ٧٥ دقيقة",
    formatEn: "6 members · 75 minutes",
    summaryAr:
      "مراجعة متبادلة لدراسات الحالة مع قواعد واضحة للتغذية الراجعة والخصوصية.",
    summaryEn:
      "Peer review for case studies with clear feedback and privacy rules.",
  },
  {
    id: "hiring-systems-room",
    persona: "hrconnect",
    titleAr: "غرفة أنظمة التوظيف",
    titleEn: "Hiring Systems Room",
    formatAr: "قادة موارد بشرية · دعوة",
    formatEn: "HR leaders · invitation",
    summaryAr: "نقاش عملي حول معايير الدور وجودة المقابلات وتجربة المرشح.",
    summaryEn:
      "A practical conversation about role clarity, interview quality and candidate experience.",
  },
  {
    id: "student-project-room",
    persona: "studentzone",
    titleAr: "غرفة مشروع الطلاب",
    titleEn: "Student Project Room",
    formatAr: "فرق صغيرة · متابعة أسبوعية",
    formatEn: "Small teams · weekly follow-up",
    summaryAr:
      "فرق طلابية تنفذ مشروعًا قصيرًا وتوثّق القرارات والنتيجة وما تعلمته.",
    summaryEn:
      "Student teams deliver a short project and document decisions, outcomes and learning.",
  },
];

export const partners = [
  {
    id: "knowledge",
    titleAr: "شريك معرفة",
    titleEn: "Knowledge partner",
    summaryAr:
      "يساهم بخبرة أو جلسة أو مراجعة محتوى بعد اتفاق واضح مع فريق USAM.",
    summaryEn:
      "Contributes expertise, sessions or content review under a clear agreement with USAM.",
  },
  {
    id: "community",
    titleAr: "شريك مجتمع",
    titleEn: "Community partner",
    summaryAr:
      "يساعد في الوصول لفئة مناسبة أو استضافة لقاء مع الالتزام بقواعد المشاركة.",
    summaryEn:
      "Helps reach a relevant audience or host a gathering under the participation guidelines.",
  },
  {
    id: "benefits",
    titleAr: "شريك مزايا",
    titleEn: "Benefits partner",
    summaryAr:
      "يقدم ميزة محددة بكمية وصلاحية وشروط معلنة تخضع للمراجعة قبل النشر.",
    summaryEn:
      "Offers a defined benefit with transparent quantity, validity and terms reviewed before publication.",
  },
];

// Launch pricing hypotheses for Egypt. The public prices are intentionally
// stored in one shared catalog so the hosted experience and EC2 API stay in
// sync. Annual prices equal ten monthly payments (two months included).
export const plans = [
  {
    code: "free",
    nameAr: "مجاني",
    nameEn: "Free",
    audience: "individual",
    monthlyEgp: 0,
    yearlyEgp: 0,
    featured: false,
    descriptionAr: "للاستكشاف وبناء أول شبكة مهنية داخل مجتمعات USAM.",
    descriptionEn: "Explore USAM Communities and start building your professional network.",
    featuresAr: ["الانضمام للمجتمعات الأربع", "المنشورات والتعليقات والحفظ", "الموارد العامة والفعاليات المجانية", "ملف عضو أساسي"],
    featuresEn: ["Join all four communities", "Posts, comments and bookmarks", "Public resources and free events", "Basic member profile"],
  },
  {
    code: "plus",
    nameAr: "بلس",
    nameEn: "Plus",
    audience: "individual",
    monthlyEgp: 149,
    yearlyEgp: 1490,
    featured: true,
    descriptionAr: "لمن يريد مسارات عملية وغرفًا صغيرة ومزايا أعضاء أعمق.",
    descriptionEn: "For members who want practical programs, small rooms and deeper benefits.",
    featuresAr: ["كل مزايا المجاني", "التقديم على البرامج والغرف المنسقة", "أولوية التسجيل في بعض الفعاليات", "مزايا وعروض الأعضاء", "شارة Plus داخل الملف"],
    featuresEn: ["Everything in Free", "Apply to programs and curated rooms", "Priority access to selected events", "Member benefits and offers", "Plus profile badge"],
  },
  {
    code: "pro",
    nameAr: "برو",
    nameEn: "Pro",
    audience: "individual",
    monthlyEgp: 349,
    yearlyEgp: 3490,
    featured: false,
    descriptionAr: "للمؤسسين والمستقلين والمهنيين الذين يحتاجون دعمًا أقرب وفرص ظهور أكبر.",
    descriptionEn: "For founders, freelancers and professionals who need closer support and more visibility.",
    featuresAr: ["كل مزايا Plus", "جلسة جماعية شهرية مع خبير", "أولوية طلب الإرشاد", "مراجعة ربع سنوية للملف أو المشروع", "دعوات مختارة للقاءات المغلقة"],
    featuresEn: ["Everything in Plus", "Monthly group expert session", "Priority mentorship requests", "Quarterly profile or project review", "Selected private-event invitations"],
  },
  {
    code: "organization",
    nameAr: "المؤسسات",
    nameEn: "Organization",
    audience: "organization",
    monthlyEgp: 1499,
    yearlyEgp: 14990,
    featured: false,
    descriptionAr: "للشركات والجامعات والمجتمعات التي تريد حضورًا منظمًا وتعاونًا مع USAM.",
    descriptionEn: "For companies, universities and communities that need an organized USAM presence.",
    featuresAr: ["صفحة مؤسسة بعد المراجعة", "حتى 10 مقاعد للفريق", "نشر فرص أو فعاليات بعد الاعتماد", "تقارير تفاعل أساسية", "نقطة تواصل للشراكات"],
    featuresEn: ["Reviewed organization page", "Up to 10 team seats", "Approved opportunities or events", "Basic engagement reporting", "Partnership contact point"],
  },
];

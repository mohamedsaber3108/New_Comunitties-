// Browser-local hosted mode. The EC2 build continues to use the Express API.
import { plans } from "./hub-content.js";
import { perksCatalog } from "./perks-data.js";
const KEY = "usam-communities-app-v2";
const communities = [
  ["launchpad", "LaunchPad", "روّاد الأعمال والمستثمرون"],
  ["freelancespace", "FreelanceSpace", "المستقلون والعملاء"],
  ["hrconnect", "HR Connect", "أصحاب العمل والتوظيف"],
  ["studentzone", "StudentZone", "الطلاب والمواهب الصاعدة"],
].map(([slug, nameEn, nameAr]) => ({ id: slug, slug, nameEn, nameAr }));
const officialAccount = {
  id: "usam-communities",
  name: "USAM Communities",
  username: "usam-communities",
  persona: "launchpad",
  bio: "Official editorial account for community prompts and practical resources.",
  location: "Egypt",
  skills: ["Community", "Learning", "Future of work"],
  discoverable: true,
  messagesEnabled: false,
};
const seedPosts = [
  {
    id: "post-customer-interviews",
    body: "إيه أهم سؤال غيّر فهمك الحقيقي للعميل؟ شارك السؤال والسبب من غير بيانات سرية.",
    communitySlug: "launchpad",
    author: officialAccount,
    createdAt: "2026-10-22T16:00:00.000Z",
    updatedAt: "2026-10-22T16:00:00.000Z",
    comments: [],
    likes: [],
    bookmarks: [],
  },
  {
    id: "post-case-study",
    body: "دراسة الحالة القوية توضح المشكلة والقرار والنتيجة. إيه الجزء اللي غالبًا بيكون ناقص في ملف الأعمال؟",
    communitySlug: "freelancespace",
    author: officialAccount,
    createdAt: "2026-10-21T12:30:00.000Z",
    updatedAt: "2026-10-21T12:30:00.000Z",
    comments: [],
    likes: [],
    bookmarks: [],
  },
  {
    id: "post-role-scorecard",
    body: "جرّبوا كتابة نتيجة واحدة مطلوبة من الدور قبل نشر الوصف الوظيفي. الوضوح هنا يحسن المقابلات كلها.",
    communitySlug: "hrconnect",
    author: officialAccount,
    createdAt: "2026-10-20T09:15:00.000Z",
    updatedAt: "2026-10-20T09:15:00.000Z",
    comments: [],
    likes: [],
    bookmarks: [],
  },
  {
    id: "post-student-project",
    body: "مشروع صغير موثق أحسن من قائمة كورسات طويلة. شاركونا فكرة مشروع تقدر تخلصها في أسبوعين.",
    communitySlug: "studentzone",
    author: officialAccount,
    createdAt: "2026-10-19T18:45:00.000Z",
    updatedAt: "2026-10-19T18:45:00.000Z",
    comments: [],
    likes: [],
    bookmarks: [],
  },
];
const seedEvents = [];
const seedOffers = [];
const seedOrganizations = [
  {
    id: "org-usam",
    name: "USAM",
    description:
      "منظومة تساعد الأفراد والمؤسسات على التعلم والتطور المهني والعمل والوصول للفرص.",
    sector: "Education & Future of Work",
    status: "approved",
  },
];
const seedMentors = [];
const seedChallenges = [];
const seedPerks = perksCatalog.map((item) => ({
  ...item,
  id: item.slug,
  status: "published",
  requiresPaid: true,
}));
const seedGroups = [
  {
    id: "founder-circle",
    slug: "founder-circle",
    type: "group",
    nameAr: "دائرة المؤسسين",
    nameEn: "Founder Circle",
    description: "نقاشات عملية بين المؤسسين داخل LaunchPad.",
    visibility: "public",
    status: "published",
    Community: { slug: "launchpad", nameAr: "LaunchPad", nameEn: "LaunchPad" },
  },
  {
    id: "campus-builders",
    slug: "campus-builders",
    type: "chapter",
    nameAr: "صنّاع المجتمعات الجامعية",
    nameEn: "Campus Builders",
    description: "Chapter للطلاب الذين يبنون مبادرات ومشروعات داخل الجامعات.",
    visibility: "public",
    status: "published",
    Community: {
      slug: "studentzone",
      nameAr: "StudentZone",
      nameEn: "StudentZone",
    },
  },
];
const seedRooms = [
  {
    id: "founder-problem-solving",
    title: "Founder Problem-Solving Room",
    description:
      "جلسة منسقة صغيرة لمناقشة تحدٍ حقيقي وتحديد خطوة متابعة واضحة.",
    capacity: 12,
    status: "open",
    Community: { slug: "launchpad", nameAr: "LaunchPad", nameEn: "LaunchPad" },
  },
  {
    id: "portfolio-feedback",
    title: "Portfolio Feedback Room",
    description:
      "مراجعة جماعية منظمة لملفات الأعمال مع موافقة المشاركين على المشاركة.",
    capacity: 10,
    status: "open",
    Community: {
      slug: "freelancespace",
      nameAr: "FreelanceSpace",
      nameEn: "FreelanceSpace",
    },
  },
];
const initial = () => ({
  user: null,
  joined: [],
  joinHistory: [],
  posts: seedPosts,
  notifications: [],
  organizations: [],
  inquiries: [],
  mentor: null,
  registrations: [],
  claims: [],
  submissions: [],
  subscription: null,
  groupMemberships: [],
  roomApplications: [],
  savedSearches: [],
  notificationPreferences: {
    inApp: true,
    email: false,
    digest: "weekly",
    kinds: [],
  },
  partnershipRequests: [],
  perkApplications: [],
});
const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);
function read() {
  try {
    return { ...initial(), ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return initial();
  }
}
function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}
function fail(message) {
  throw new Error(message);
}
const author = (user) =>
  user && {
    id: user.id,
    name: user.name,
    username: user.username,
    persona: user.persona,
  };
function safePost(post, user) {
  return {
    ...post,
    author: post.author,
    community: communities.find((c) => c.slug === post.communitySlug),
    commentsCount: post.comments.length,
    reactionsCount: post.likes.length,
    liked: !!user && post.likes.includes(user.id),
    saved: !!user && post.bookmarks.includes(user.id),
    own: post.author.id === user?.id,
  };
}
export default async function previewApi(endpoint, options = {}) {
  const state = read(),
    method = (options.method || "GET").toUpperCase(),
    body = options.body ? JSON.parse(options.body) : {};
  const url = new URL(endpoint, location.origin),
    path = url.pathname,
    now = () => new Date().toISOString();
  if (path === "/plans")
    return { currency: "EGP", annualDiscountMonths: 2, items: plans };
  if (path === "/billing") {
    if (!state.user) fail("sign_in_required");
    return {
      subscription: state.subscription
        ? {
            ...state.subscription,
            plan: plans.find((p) => p.code === state.subscription.planCode),
          }
        : null,
      paymentProvider: "paymob",
      paymentsConfigured: false,
    };
  }
  if (path === "/subscriptions" && method === "POST") {
    if (!state.user) fail("sign_in_required");
    const plan = plans.find((p) => p.code === body.planCode),
      billingCycle = ["monthly", "yearly"].includes(body.billingCycle)
        ? body.billingCycle
        : null;
    if (!plan || !billingCycle) fail("invalid_plan");
    const amountEgp =
      billingCycle === "yearly" ? plan.yearlyEgp : plan.monthlyEgp;
    state.subscription = {
      id: newId(),
      planCode: plan.code,
      billingCycle,
      amountEgp,
      status: amountEgp === 0 ? "free" : "pending_payment",
      startsAt: amountEgp === 0 ? now() : null,
      createdAt: now(),
    };
    save(state);
    return {
      subscriptionId: state.subscription.id,
      status: state.subscription.status,
      amountEgp,
      currency: "EGP",
      plan,
      ...(amountEgp
        ? {
            paymentStatus: "pending",
            checkout: {
              provider: "paymob",
              configured: false,
              message: "payment_provider_activation_required",
            },
          }
        : {}),
    };
  }
  if (path === "/subscriptions/current" && method === "DELETE") {
    if (!state.user) fail("sign_in_required");
    if (!state.subscription) fail("no_active_subscription");
    state.subscription.status = "canceled";
    state.subscription.canceledAt = now();
    save(state);
    return { status: "canceled" };
  }
  if (path === "/perks" && method === "GET") {
    const eligible =
      !!state.user &&
      state.subscription?.status === "active" &&
      Number(state.subscription?.amountEgp || 0) > 0;
    return {
      access: {
        eligible,
        plan: eligible
          ? plans.find((x) => x.code === state.subscription.planCode)
          : null,
        reason: eligible
          ? null
          : state.user
            ? "paid_membership_required"
            : "sign_in_required",
      },
      items: seedPerks.map((item) => ({
        ...item,
        application: state.user
          ? state.perkApplications.find((x) => x.PerkId === item.id) || null
          : null,
      })),
      disclosure:
        "External programs are subject to each provider's current eligibility, terms and final approval. USAM support does not guarantee acceptance or credit value.",
    };
  }
  if (path === "/my-perk-applications" && method === "GET") {
    if (!state.user) fail("sign_in_required");
    return {
      items: state.perkApplications.map((item) => ({
        ...item,
        Perk: seedPerks.find((x) => x.id === item.PerkId),
      })),
    };
  }
  const perkApplyMatch = path.match(/^\/perks\/([^/]+)\/apply$/);
  if (perkApplyMatch && method === "POST") {
    if (!state.user) fail("sign_in_required");
    if (
      state.subscription?.status !== "active" ||
      Number(state.subscription?.amountEgp || 0) <= 0
    )
      fail("paid_membership_required");
    const perk = seedPerks.find((x) => x.id === perkApplyMatch[1]);
    if (!perk) fail("perk_unavailable");
    if (state.perkApplications.some((x) => x.PerkId === perk.id))
      fail("perk_application_exists");
    if (
      String(body.startupName || "").trim().length < 2 ||
      String(body.stage || "").trim().length < 2 ||
      String(body.useCase || "").trim().length < 30
    )
      fail("invalid_perk_application");
    const item = {
      id: newId(),
      PerkId: perk.id,
      UserId: state.user.id,
      startupName: String(body.startupName).trim(),
      website: String(body.website || "").trim(),
      stage: String(body.stage).trim(),
      useCase: String(body.useCase).trim(),
      status: "submitted",
      createdAt: now(),
    };
    state.perkApplications.unshift(item);
    state.notifications.unshift({
      id: newId(),
      kind: "perk_application",
      text: `Your ${perk.provider} perk application was received`,
      href: "/perks",
      createdAt: now(),
    });
    save(state);
    return { id: item.id, status: item.status };
  }
  if (path === "/me") {
    if (method === "PATCH") {
      if (!state.user) fail("sign_in_required");
      state.user = {
        ...state.user,
        ...Object.fromEntries(
          [
            "name",
            "bio",
            "location",
            "persona",
            "language",
            "discoverable",
            "messagesEnabled",
            "skills",
          ]
            .filter((k) => k in body)
            .map((k) => [k, body[k]]),
        ),
      };
      save(state);
    }
    return { user: state.user };
  }
  if ((path === "/auth/local" || path === "/auth/demo") && method === "POST") {
    const name = (body.name || "عضو USAM").trim().slice(0, 100),
      persona = communities.some((c) => c.slug === body.persona)
        ? body.persona
        : "launchpad";
    state.user ??= {
      id: "local-member",
      name,
      username: `member-${newId().slice(-6)}`,
      persona,
      role: "member",
      bio: "",
      location: (body.location || "").trim().slice(0, 100),
      skills: [],
      language: "ar",
      discoverable: false,
      messagesEnabled: false,
    };
    save(state);
    return { user: state.user };
  }
  if (path === "/auth/logout" || path === "/auth/logout-all") {
    state.user = null;
    save(state);
    return { ok: true };
  }
  if (path === "/contact" && method === "POST") {
    if (
      body.name?.trim().length < 2 ||
      !/^\S+@\S+\.\S+$/.test(body.email || "") ||
      body.message?.trim().length < 20
    )
      fail("invalid_contact");
    const reference = newId().slice(0, 8).toUpperCase();
    state.inquiries.push({ reference, topic: body.topic, createdAt: now() });
    save(state);
    return { reference };
  }
  if (path === "/me/summary")
    return {
      joinedCount: state.joined.length,
      postCount: state.posts.filter((p) => p.author.id === state.user?.id)
        .length,
      profileDone: !!(state.user?.bio?.trim() && state.user?.skills?.length),
    };
  if (path === "/my-events")
    return {
      items: state.registrations
        .filter((r) => r.status !== "cancelled")
        .map((r) => ({
          ...r,
          Event: seedEvents.find((e) => e.id === r.EventId),
        })),
    };
  if (path === "/activity") {
    const items = [
      ...state.joinHistory.map((x) => ({
        id: x.id,
        kind: "join",
        detail: communities.find((c) => c.slug === x.slug)?.nameEn || "",
        href: `/communities/${x.slug}`,
        createdAt: x.createdAt,
      })),
      ...state.posts
        .filter((p) => p.author.id === state.user?.id)
        .map((p) => ({
          id: p.id,
          kind: "post",
          detail:
            communities.find((c) => c.slug === p.communitySlug)?.nameEn || "",
          href: `/posts/${p.id}`,
          createdAt: p.createdAt,
        })),
      ...state.registrations
        .filter((r) => r.status !== "cancelled")
        .map((r) => ({
          id: r.id,
          kind: "event",
          detail: seedEvents.find((e) => e.id === r.EventId)?.title || "",
          href: `/events/${r.EventId}`,
          createdAt: r.createdAt,
        })),
      ...state.claims.map((c) => ({
        id: c.id,
        kind: "offer",
        detail: seedOffers.find((o) => o.id === c.OfferId)?.title || "",
        href: "/offers",
        createdAt: c.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { items };
  }
  if (path === "/communities") return { items: communities };
  const communityMatch = path.match(/^\/communities\/([^/]+)(?:\/(join))?$/);
  if (communityMatch) {
    const c = communities.find((x) => x.slug === communityMatch[1]);
    if (!c) fail("not_found");
    if (communityMatch[2]) {
      if (!state.user) fail("sign_in_required");
      if (method !== "DELETE" && !state.joined.includes(c.slug))
        state.joinHistory.unshift({
          id: newId(),
          slug: c.slug,
          createdAt: now(),
        });
      state.joined =
        method === "DELETE"
          ? state.joined.filter((x) => x !== c.slug)
          : [...new Set([...state.joined, c.slug])];
      save(state);
      return { joined: state.joined.includes(c.slug) };
    }
    return {
      item: c,
      membersCount: state.joined.includes(c.slug) ? 1 : 0,
      joined: state.joined.includes(c.slug),
    };
  }
  if (path === "/posts" && method === "POST") {
    if (!state.user) fail("sign_in_required");
    const text = (body.body || "").trim(),
      c = communities.find((x) => x.slug === body.community);
    if (!c || text.length < 2) fail("invalid_post");
    if (!state.joined.includes(c.slug)) fail("join_community_first");
    const id = newId();
    state.posts.unshift({
      id,
      body: text,
      communitySlug: c.slug,
      author: author(state.user),
      createdAt: now(),
      updatedAt: now(),
      comments: [],
      likes: [],
      bookmarks: [],
    });
    save(state);
    return { id };
  }
  if (path === "/posts" && method === "GET") {
    const mode = url.searchParams.get("mode"),
      slug = url.searchParams.get("community");
    return {
      items: state.posts
        .filter(
          (p) => (!slug || p.communitySlug === slug) && mode !== "following",
        )
        .map((p) => safePost(p, state.user)),
    };
  }
  if (path === "/saved")
    return {
      items: state.posts
        .filter((p) => p.bookmarks.includes(state.user?.id))
        .map((p) => safePost(p, state.user)),
    };
  const postMatch = path.match(
    /^\/posts\/([^/]+)(?:\/(reaction|bookmark|comments)(?:\/([^/]+))?)?$/,
  );
  if (postMatch) {
    const p = state.posts.find((x) => x.id === postMatch[1]);
    if (!p) fail("not_found");
    const [, id, action, commentId] = postMatch;
    if (method === "GET")
      return { item: { ...safePost(p, state.user), comments: p.comments } };
    if (!state.user) fail("sign_in_required");
    if (!action) {
      if (p.author.id !== state.user.id) fail("forbidden");
      if (method === "DELETE")
        state.posts = state.posts.filter((x) => x.id !== id);
      if (method === "PATCH") {
        p.body = (body.body || "").trim();
        p.updatedAt = now();
      }
    } else if (action === "reaction" || action === "bookmark") {
      const target = action === "reaction" ? "likes" : "bookmarks";
      p[target] =
        method === "DELETE"
          ? p[target].filter((x) => x !== state.user.id)
          : [...new Set([...p[target], state.user.id])];
    } else if (action === "comments") {
      if (method === "POST")
        p.comments.push({
          id: newId(),
          body: (body.body || "").trim(),
          author: author(state.user),
          createdAt: now(),
        });
      if (method === "DELETE")
        p.comments = p.comments.filter((x) => x.id !== commentId);
    }
    save(state);
    return { ok: true };
  }
  if (path === "/organizations" && method === "POST") {
    if (!state.user) fail("sign_in_required");
    const id = newId();
    state.organizations.push({ ...body, id, status: "pending" });
    save(state);
    return { id, status: "pending" };
  }
  if (path === "/mentors" && method === "POST") {
    if (!state.user) fail("sign_in_required");
    state.mentor = {
      id: "preview-mentor",
      expertise: body.expertise,
      availability: body.availability,
      published: false,
      UserId: state.user.id,
    };
    save(state);
    return { id: state.mentor.id, status: "pending_review" };
  }
  if (path === "/mentorship")
    return { mentor: state.mentor, sent: [], incoming: [] };
  if (path === "/my-submissions")
    return {
      items: state.submissions.map((s) => ({
        ...s,
        Challenge: seedChallenges.find((c) => c.id === s.ChallengeId),
      })),
    };
  if (path === "/messages") return { items: [] };
  if (path === "/notifications") return { items: state.notifications };
  if (path === "/notifications/read-all" && method === "PATCH") {
    state.notifications = state.notifications.map((x) => ({
      ...x,
      readAt: x.readAt || now(),
    }));
    save(state);
    return { ok: true };
  }
  if (path === "/notification-preferences") {
    if (!state.user) fail("sign_in_required");
    if (method === "PUT") {
      state.notificationPreferences = {
        ...state.notificationPreferences,
        ...body,
      };
      save(state);
      return { ok: true };
    }
    return { item: state.notificationPreferences };
  }
  if (path === "/saved-searches") {
    if (!state.user) fail("sign_in_required");
    if (method === "POST") {
      if (
        (body.label || "").trim().length < 2 ||
        (body.query || "").trim().length < 2
      )
        fail("invalid_saved_search");
      const item = {
        id: newId(),
        label: body.label.trim(),
        query: body.query.trim(),
        filters: JSON.stringify(body.filters || {}),
        createdAt: now(),
      };
      state.savedSearches.unshift(item);
      save(state);
      return { id: item.id };
    }
    return { items: state.savedSearches };
  }
  const savedSearchMatch = path.match(/^\/saved-searches\/([^/]+)$/);
  if (savedSearchMatch && method === "DELETE") {
    state.savedSearches = state.savedSearches.filter(
      (x) => x.id !== savedSearchMatch[1],
    );
    save(state);
    return { ok: true };
  }
  if (path === "/groups")
    return {
      items: seedGroups.map((g) => ({
        ...g,
        membership:
          state.groupMemberships.find((x) => x.GroupId === g.id) || null,
      })),
    };
  if (path === "/me/groups")
    return {
      items: state.groupMemberships.map((x) => ({
        ...x,
        Group: seedGroups.find((g) => g.id === x.GroupId),
      })),
    };
  const groupMatch = path.match(/^\/groups\/([^/]+)\/join$/);
  if (groupMatch) {
    if (!state.user) fail("sign_in_required");
    const group = seedGroups.find((x) => x.id === groupMatch[1]);
    if (!group) fail("not_found");
    if (!state.joined.includes(group.Community.slug))
      fail("join_community_first");
    let item = state.groupMemberships.find((x) => x.GroupId === group.id);
    if (method === "DELETE") {
      if (item) item.status = "left";
      save(state);
      return { status: "left" };
    }
    if (!item) {
      item = {
        id: newId(),
        GroupId: group.id,
        UserId: state.user.id,
        status: group.visibility === "private" ? "pending" : "active",
        role: "member",
        createdAt: now(),
      };
      state.groupMemberships.push(item);
    } else item.status = group.visibility === "private" ? "pending" : "active";
    save(state);
    return { status: item.status };
  }
  if (path === "/curated-rooms")
    return {
      items: seedRooms.map((room) => ({
        ...room,
        application:
          state.roomApplications.find((x) => x.RoomId === room.id) || null,
      })),
    };
  if (path === "/me/room-applications")
    return {
      items: state.roomApplications.map((x) => ({
        ...x,
        Room: seedRooms.find((r) => r.id === x.RoomId),
      })),
    };
  const roomApplyMatch = path.match(/^\/curated-rooms\/([^/]+)\/applications$/);
  if (roomApplyMatch && method === "POST") {
    if (!state.user) fail("sign_in_required");
    const room = seedRooms.find((x) => x.id === roomApplyMatch[1]);
    if (!room) fail("room_unavailable");
    if (!state.joined.includes(room.Community.slug))
      fail("join_community_first");
    if ((body.motivation || "").trim().length < 20) fail("invalid_motivation");
    let item = state.roomApplications.find((x) => x.RoomId === room.id);
    if (!item) {
      item = {
        id: newId(),
        RoomId: room.id,
        UserId: state.user.id,
        motivation: body.motivation.trim(),
        status: "pending",
        createdAt: now(),
      };
      state.roomApplications.push(item);
    } else
      Object.assign(item, {
        motivation: body.motivation.trim(),
        status: "pending",
      });
    save(state);
    return { id: item.id, status: item.status };
  }
  if (path === "/partnerships/mine")
    return { items: state.partnershipRequests };
  if (path === "/partnerships" && method === "POST") {
    if (!state.user) fail("sign_in_required");
    if (
      (body.organizationName || "").trim().length < 2 ||
      (body.objective || "").trim().length < 30
    )
      fail("invalid_partnership");
    const item = {
      id: newId(),
      ...body,
      status: "requested",
      createdAt: now(),
    };
    state.partnershipRequests.unshift(item);
    save(state);
    return { id: item.id, status: item.status };
  }
  if (path === "/organizations/mine")
    return {
      items: state.organizations.map((x) => ({
        ...x,
        OrganizationMembers: [],
      })),
    };
  if (path === "/platform-config")
    return {
      flags: {
        rooms_applications: true,
        saved_searches: true,
        partnership_requests: true,
      },
      content: {},
    };
  if (path === "/members")
    return {
      items: [
        officialAccount,
        ...(state.user?.discoverable ? [state.user] : []),
      ],
    };
  if (path.startsWith("/members/")) {
    const username = path.split("/")[2];
    const user =
      (officialAccount.username === username ? officialAccount : null) ||
      (state.user?.discoverable && state.user.username === username
        ? state.user
        : null);
    return { item: user, following: false };
  }
  if (path === "/search") {
    const q = (url.searchParams.get("q") || "").toLocaleLowerCase();
    if (q.length < 2) return { members: [], posts: [], events: [] };
    return {
      members: [
        officialAccount,
        ...(state.user?.discoverable ? [state.user] : []),
      ].filter((m) =>
        [m.name, m.bio, ...(m.skills || [])]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q),
      ),
      posts: state.posts
        .filter((p) => p.body.toLocaleLowerCase().includes(q))
        .map((p) => safePost(p, state.user)),
      events: seedEvents.filter((e) =>
        [e.title, e.description].join(" ").toLocaleLowerCase().includes(q),
      ),
    };
  }
  if (path === "/events") return { items: seedEvents };
  const eventMatch = path.match(/^\/events\/([^/]+)(?:\/(register|ticket))?$/);
  if (eventMatch) {
    const event = seedEvents.find((e) => e.id === eventMatch[1]);
    if (!event) fail("not_found");
    if (eventMatch[2] === "ticket") {
      if (!state.user) fail("sign_in_required");
      const registration = state.registrations.find(
        (r) => r.EventId === event.id && r.status === "registered",
      );
      if (!registration) fail("ticket_not_found");
      registration.ticketCode ||= newId()
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()
        .slice(0, 16);
      save(state);
      return {
        ticket: {
          code: registration.ticketCode,
          checkedInAt: registration.checkedInAt || null,
          event,
        },
      };
    }
    if (eventMatch[2] === "register") {
      if (!state.user) fail("sign_in_required");
      let registration = state.registrations.find(
        (r) => r.EventId === event.id,
      );
      if (method === "DELETE") {
        if (registration) registration.status = "cancelled";
        save(state);
        return { status: "cancelled" };
      }
      const active = state.registrations.filter(
        (r) => r.EventId === event.id && r.status === "registered",
      ).length;
      if (registration) {
        registration.status =
          active >= event.capacity ? "waitlisted" : "registered";
        registration.createdAt = now();
      } else {
        registration = {
          id: newId(),
          EventId: event.id,
          UserId: state.user.id,
          status: active >= event.capacity ? "waitlisted" : "registered",
          createdAt: now(),
        };
        state.registrations.push(registration);
      }
      save(state);
      return { status: registration.status };
    }
    return {
      item: {
        ...event,
        Registrations: state.registrations.filter(
          (r) => r.EventId === event.id,
        ),
      },
    };
  }
  if (path === "/offers") return { items: seedOffers };
  const offerMatch = path.match(/^\/offers\/([^/]+)\/claim$/);
  if (offerMatch && method === "POST") {
    if (!state.user) fail("sign_in_required");
    const offer = seedOffers.find((o) => o.id === offerMatch[1]);
    if (!offer) fail("not_found");
    let claim = state.claims.find((c) => c.OfferId === offer.id);
    if (!claim) {
      claim = { id: newId(), OfferId: offer.id, createdAt: now() };
      state.claims.push(claim);
      save(state);
    }
    return { claimId: claim.id.slice(0, 8).toUpperCase() };
  }
  if (path === "/organizations")
    return {
      items: [
        ...seedOrganizations,
        ...state.organizations.filter((x) => x.status === "approved"),
      ],
    };
  if (path === "/mentors") return { items: seedMentors };
  if (path === "/challenges") return { items: seedChallenges };
  const challengeMatch = path.match(
    /^\/challenges\/([^/]+)(?:\/(submissions))?$/,
  );
  if (challengeMatch) {
    const challenge = seedChallenges.find((c) => c.id === challengeMatch[1]);
    if (!challenge) fail("not_found");
    const mine = state.submissions.find(
      (s) => s.ChallengeId === challenge.id && s.UserId === state.user?.id,
    );
    if (challengeMatch[2] && method === "POST") {
      if (!state.user) fail("sign_in_required");
      const text = (body.body || "").trim();
      if (text.length < 20) fail("invalid_submission");
      if (mine) {
        mine.body = text;
        mine.updatedAt = now();
      } else
        state.submissions.push({
          id: newId(),
          ChallengeId: challenge.id,
          UserId: state.user.id,
          body: text,
          status: "submitted",
          createdAt: now(),
          updatedAt: now(),
        });
      save(state);
      return { ok: true };
    }
    return { item: challenge, mine };
  }
  fail("preview_unavailable");
}

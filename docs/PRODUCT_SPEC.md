# Product specification — implemented build

## Public routes

`/`, `/communities`, `/communities/:slug`, `/explore`, `/programs`, `/rooms`, `/partners`, `/pricing`, `/resources`, `/resources/:slug`, `/faq`, `/contact`, `/about`, `/how-it-works`, `/guidelines`, `/privacy`, `/terms`, `/refund-policy`, `/accessibility`, `/feed`, `/posts/:id`, `/events`, `/events/:id`, `/offers`, `/members`, `/members/:username`, `/organizations`, `/mentors`, `/challenges`, `/challenges/:id`, `/opportunities`, `/jobs` (redirect), `/search`, `/login`, `/signup`, and an intentional 404.

## Signed-in routes

`/home`, `/dashboard` (redirect), `/activity`, `/my-events`, `/me`, `/settings`, `/saved`, `/notifications`, `/messages`, `/messages/:id`, `/organization/new`, `/mentorship`, `/my-submissions`, `/checkout/:planCode`, `/billing`, and `/admin` (admin role). Shared layout uses a sidebar on desktop and bottom navigation on mobile.

## Journeys implemented

1. Sign up with a chosen starting persona; join an official community; publish a text post; another member comments; author receives an in-app notification.
2. Opt in to member discovery in settings. The directory and profile endpoint then expose only selected public fields.
3. Admin creates a free event; member registers; a full event waitlists the next user; cancellation promotes the earliest waiting registration.
4. Admin publishes a challenge; community member submits text and can revise until review or deadline; admin reviews and member sees feedback.
5. Member submits a mentor profile; admin approves it; another member sends a request; mentor accepts or declines; requester receives a notification.
6. Member submits an organization for admin review; approved entries become public.
7. Admin publishes a perk with a quantity limit; member claims once and receives a claim ID and configured code when present.
8. Member follows a visible profile, sees a following feed, saves posts, searches published content, reports a post, and reviews notifications.
9. Two members opt into messaging, join a common community, start a conversation, send messages and receive notifications. A block ends contact and removes follow edges.
10. A new member sees a short onboarding checklist tied to their profile and real membership/post counts, opens a relevant practical guide, and reviews their activity and event registrations.
11. A post author can edit their published text through the interface. Public visitors can browse eight bilingual guides, read FAQs, and submit a contact request into an admin-only queue.

The landing and community copy describes intended participation; it makes no claim that real members or partners exist. Admin controls are restricted by server-side role checks. Paid ticketing is deliberately rejected by the API.

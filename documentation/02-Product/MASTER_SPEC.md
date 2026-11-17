# Master product specification

USAM Communities is the professional network across four USAM audiences. A member creates one profile, selects a starting persona, may join more than one official community, contributes to professional discussions, attends events, uses practical resources, takes part in challenges, discovers mentors and organizations, and follows clear handoffs to other USAM products.

## Core journeys

1. Create a profile, select a persona, complete bio and skills, join one or more communities.
2. Read or publish a post, comment, react, save, follow, report, block or share.
3. Discover a free event, register, join a waitlist when full and cancel registration.
4. Review personal activity and event registrations.
5. Open a program or curated room, understand its format and continue through the relevant community.
6. Submit or revise a challenge response and receive admin feedback in the server build.
7. Discover a reviewed mentor, submit a mentor profile and manage requests.
8. Submit an organization for review; admins approve or reject it.
9. Claim a published perk once; capacity is controlled transactionally by the server API.
10. Search members, posts and events subject to visibility and block rules.
11. Send messages only after both parties opt in and share a community.
12. Use the Jobs, Education and Freelancing gateways without duplicating their source data.

## Hosted and EC2 behavior

The hosted Site supplies an immediate browser-local experience: profile, joins, posts, comments, reactions, saves, free-event registrations, challenge submissions and perk claims persist on the current device. The EC2 package supplies authenticated multi-user server sessions and database persistence. Public launch requires deploying that server build or migrating its API to a supported hosted backend.

## Product guardrails

- No fake counts, investment promises, job guarantees or invented partners.
- “Verified” requires admin approval in the server build.
- Paid tickets remain rejected until a real payment provider and refund flow exist.
- Matching, introductions, account actions, moderation sanctions and financial actions require human control.
- Cross-product links do not imply unified SSO until an approved identity contract is implemented.


# Engine spec — Groups, Chapters and Curated Rooms

## Groups and chapters

Platform admins create published groups/chapters. A member must belong to the parent official community. Public groups activate immediately; private groups enter `pending` and require human review. Membership states are `pending → active|rejected`, with member-controlled `left` and an explicit re-application path.

## Curated rooms

Admins create/open rooms. Members provide a meaningful motivation and must belong to the parent community. Admin acceptance is capacity-gated. Accepted participants can be checked in; checked-in participants may submit a 1–5 rating plus feedback. Every review/check-in is audited and member-visible state changes generate notifications.

## Failure modes

Missing parent membership, repeated active application, room capacity exceeded, review without admin role, feedback before check-in and invalid state transitions are rejected server-side.

## Evidence

`server/db.js`, `server/index.js`, `server/api.test.js`, `src/main.jsx`, `src/preview-api.js`.

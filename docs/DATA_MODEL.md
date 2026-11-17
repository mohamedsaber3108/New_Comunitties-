# Data model and initialization

Sequelize models in `server/db.js`: User, Session, Community, Membership, Post, Comment, Reaction, Bookmark, Event, Registration, Offer, Claim, Organization, Mentor, MentorRequest, Conversation, Message, Block, Follow, Challenge, Submission, Notification, Report, AuditLog, ContactRequest.

ContactRequest stores a visitor name, email, topic, message, status and timestamps. Admins can review and close requests; there is no outbound email delivery. Static hosted mode stores only a local reference and topic, never the submitted contact details.

Foreign keys and important unique relationships include username/email, session token hash, community slug, one membership per user/community, one reaction and bookmark per user/post, one registration per user/event, one claim per user/offer, and one submission per user/challenge, one follow and block per ordered pair, and one conversation per sorted user pair. All models carry UUID primary keys and timestamps. Jobs are not duplicated in this database.

Local development initializes SQLite automatically. In MySQL production mode the API only calls `authenticate`; it does not auto-create tables. `CONFIRM_EMPTY_DB=yes npm run db:bootstrap` explicitly creates schema and official community rows in an **empty** database. This is a bootstrap, not a versioned migration system. No historical PostgreSQL migration or reconciliation has been run. A versioned migration plan and isolated production-like MySQL test are required before deploying onto any existing Hub database. Do not point this new schema at existing production tables.

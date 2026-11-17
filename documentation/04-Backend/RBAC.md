# RBAC and authorization matrix

| Action | Guest | Member | Moderator | Admin |
|---|---:|---:|---:|---:|
| Read public communities/feed/events/resources | yes | yes | yes | yes |
| Join official community | no | own account | own account | own account |
| Create official community | no | no | no | no public route; seed/admin operation only |
| Publish post | no | joined community | joined community | joined community |
| Edit/delete post | no | author only | author only | current API author only |
| Comment/react/save/report | no | yes | yes | yes |
| Register for free event | no | own account | own account | own account |
| Create event/offer/challenge | no | no | no | yes |
| Review reports/orgs/mentors/submissions/contact | no | no | no | yes |
| View member directory | public opt-in fields | public opt-in fields | same | same |
| Start messages | no | mutual opt-in + shared community + no block | same | same |
| View another member's private records | no | no | no | no |
| View admin metrics/audit actions | no | no | no | yes |

Current user roles are `member`, `moderator`, `admin`. Super Admin, Community Manager and Organization Admin scopes are not implemented. Tenant scoping and organization team permissions are missing. The moderator role has no distinct operational surface yet.


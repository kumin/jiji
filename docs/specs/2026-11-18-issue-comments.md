# Issue comments

Ticket: none (feature proposed by Claude: the issue tracker has no discussion thread on an issue)
Status: Draft

## Problem
Issues in Jiji have a title, description and metadata, but there is nowhere to discuss them. Teammates have to rewrite the description or talk elsewhere, and the context is lost. Every Jira-style tracker has per-issue comments; Jiji needs them to be useful for a team.

## Scope
- In: add, list, edit and delete comments on an issue; show them on the issue detail page; comment count on list rows.
- Out (not doing now): @mentions, notifications, markdown rendering, attachments, reactions, threaded replies, an activity or audit log, pagination, realtime updates.

## Design
### Components touched
- `prisma/schema.prisma`: new `Comment` model plus a migration.
- `src/lib/validation.ts`: `commentSchema`.
- `src/lib/issue-service.ts` and `src/lib/types.ts`: `CommentDTO` and `toCommentDTO`, following the `toIssueDTO` and `toUserDTO` pattern.
- `src/app/api/issues/[id]/comments/route.ts` (new): `GET` and `POST`.
- `src/app/api/issues/[id]/comments/[commentId]/route.ts` (new): `PATCH` and `DELETE`.
- `src/lib/queries.ts`: `listComments(issueId)`; add `_count.comments` to the issue list query.
- `src/components/CommentSection.tsx` (new client component), used by `src/app/issues/[id]/page.tsx`.
- `src/components/IssueTable.tsx`: show the comment count.

### API / interface
All routes follow the existing conventions: 401 `{error:"Unauthorized"}` without a session, 400 `{error:"Validation failed", fields:{...}}` for bad input, 404 `{error:"..."}` when something is missing.

`POST /api/issues/{id}/comments`
```json
// request
{ "body": "Looks good, shipping Friday." }
// 201
{ "comment": { "id": "c1", "issueId": "i1", "body": "Looks good, shipping Friday.",
               "author": { "id": "u1", "name": "Ada", "email": "...", "color": "#6366f1", "image": null },
               "createdAt": "2026-11-18T10:00:00.000Z", "updatedAt": "2026-11-18T10:00:00.000Z",
               "edited": false } }
```
- `GET /api/issues/{id}/comments` returns 200 `{ "comments": [...] }`, oldest first. It returns 404 if the issue doesn't exist.
- `PATCH /api/issues/{id}/comments/{commentId}` takes `{ "body": "..." }` and returns 200 `{ "comment": ... }` with `edited: true`. Only the author may edit; anyone else gets 403 `{error:"Only the author can edit this comment"}`.
- `DELETE /api/issues/{id}/comments/{commentId}` returns 204. Only the author may delete (403 otherwise).
- `body` is trimmed, must be 1–5000 characters, and is stored verbatim as plain text (React escapes it on render).
- A `commentId` that doesn't belong to `{id}` returns 404.

### Data
```prisma
model Comment {
  id        String   @id @default(cuid())
  body      String
  issueId   String
  issue     Issue    @relation(fields: [issueId], references: [id], onDelete: Cascade)
  authorId  String?
  author    User?    @relation("CommentAuthor", fields: [authorId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([issueId, createdAt])
}
```
`Issue` gets `comments Comment[]`; `User` gets `comments Comment[] @relation("CommentAuthor")`. The migration only adds a table, so existing data is untouched. Deleting an issue cascades to its comments. Deleting a user nulls `authorId`, and the UI shows "Unknown user" (the same approach as the nullable reporter). `edited` is derived as `updatedAt > createdAt`.

### Flow
1. A signed-in user opens `/issues/{id}`. The server page loads the issue and its comments.
2. The user types in the comment box and submits. `POST` validates, takes `authorId` from the session (never the client), and inserts the row.
3. The client appends the returned comment to the list.
4. Authors see Edit and Delete controls on their own comments only. Edit is inline, and Delete asks for confirmation.
5. Failures (400, 403, 404) are shown inline and the typed text is kept.

## Acceptance criteria
1. Given a signed-in user and an existing issue, when they POST `{"body":"hi"}` to `/api/issues/{id}/comments`, then the response is 201, `author.id` is the session user, and a following GET lists the comment.
2. Given a POST body that is empty, whitespace-only, over 5000 characters, or missing, then the response is 400 with `fields.body` set, and nothing is stored.
3. Given an unknown issue id, when POST or GET is called, then the response is 404.
4. Given no session, when any comment endpoint is called with POST, PATCH or DELETE, then the response is 401.
5. Given several comments, when GET is called, then they are returned oldest first.
6. Given a comment by user A, when A PATCHes `{"body":"fixed"}`, then the response is 200, the body is updated and `edited` is true.
7. Given a comment by user A, when user B PATCHes or DELETEs it, then the response is 403 and the comment is unchanged.
8. Given a comment by user A, when A DELETEs it, then the response is 204 and a GET no longer lists it.
9. Given a `commentId` that belongs to a different issue, when PATCH or DELETE is called, then the response is 404.
10. Given an issue with comments, when the issue is deleted, then its comments are deleted too (no orphan rows).
11. Given a comment whose author was deleted, when the issue page renders, then the comment is shown with "Unknown user" and without Edit and Delete controls.
12. Given the issue detail page, when a user posts, edits or deletes a comment, then the UI updates without a full reload; a failed request shows an error and keeps the input.
13. Given the issue list, when an issue has N comments, then the row shows N (nothing is shown for 0).
14. `npm run check` (typecheck, lint, tests) passes, and the new migration applies cleanly with `npm run db:deploy`.

## Risks and open questions
- Risk: the list-count query adds a join per page load → use Prisma `_count`, which is a single aggregate, and keep the existing indexes.
- Risk: very long comment threads render in full → acceptable for a small self-hosted tracker; pagination is out of scope.
- Assumption: only the author can edit or delete a comment. Admins don't exist in this app. Confirm if you want any user to be able to delete.
- Assumption: plain text only (whitespace preserved, like the description). Markdown is deferred.
- Assumption: the 5000-character limit is arbitrary.
- Assumption: API tests follow `tests/api.test.ts` (live server and dev-login), plus unit tests for `commentSchema` in `tests/validation.test.ts`.

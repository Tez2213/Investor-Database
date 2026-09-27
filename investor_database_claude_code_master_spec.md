# Investor Database Web App — Claude Code Master Specification

## 1. Project Goal

Build a production-ready **Investor Database / Investor Research Platform** using **Next.js + TypeScript + PostgreSQL on Neon**.

The application will contain approximately **235,675 investor records** and should allow users to search, filter, browse, inspect, and eventually export investor information.

The application should feel like a modern SaaS/data-research product rather than a basic HTML table.

### Architecture

```text
Browser
   ↓
Next.js frontend
   ↓
Next.js API routes / server-side code
   ↓
Neon PostgreSQL
```

**Important:** Never expose the Neon PostgreSQL connection string or database credentials to the browser.

---

## 2. Current Project

Project location:

```text
~/Desktop/investor-dashboard
```

Created with:

```bash
npx create-next-app@latest investor-dashboard
```

Current stack:

```text
Next.js 16.3.6
React 19.2.8
TypeScript 5
Tailwind CSS 4
pg 8.23.0
```

The project uses the App Router.

Expected structure:

```text
investor-dashboard/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── investors/
│   │   │       └── route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   └── lib/
│       └── db.ts
│
├── .env.local
├── package.json
├── tsconfig.json
├── next.config.ts
└── ...
```

There is already a `.env.local` containing the Neon `DATABASE_URL`.

**Never print, expose, commit, or hard-code the DATABASE_URL.**

---

# 3. Database

The database is Neon PostgreSQL.

### Neon project

```text
Project ID: lingering-resonance-02836474
Project name: Data
Region: aws-us-east-2
Branch: production
```

Main table:

```text
investors
```

Schema:

```sql
CREATE TABLE investors (
    id BIGSERIAL PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    title TEXT,
    company_name TEXT,
    email TEXT,
    linkedin TEXT,
    quality TEXT,
    industry TEXT,
    website TEXT,
    company_linkedin_url TEXT,
    city TEXT,
    country TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Current size:

```text
Approximately 235,675 rows
```

Standardized schema:

```text
1. First Name
2. Last Name
3. Title
4. Company Name
5. Email
6. LinkedIn
7. Quality
8. Industry
9. Website
10. Company Linkedin Url
11. City
12. Country
```

---

# 4. Existing Database Indexes

These indexes already exist:

```sql
CREATE INDEX idx_investors_email
ON investors (LOWER(email));

CREATE INDEX idx_investors_linkedin
ON investors (linkedin);

CREATE INDEX idx_investors_company
ON investors (LOWER(company_name));

CREATE INDEX idx_investors_name_company
ON investors (
    LOWER(first_name),
    LOWER(last_name),
    LOWER(company_name)
);
```

Additional indexes may be added where they materially improve application performance, especially for:

```text
country
industry
city
quality
title
```

For global search, consider PostgreSQL trigram/full-text search if appropriate.

Do not blindly create unnecessary indexes.

---

# 5. Database Connection

Current file:

```text
src/lib/db.ts
```

Current implementation:

```ts
import { Pool } from "pg";

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}
```

Keep this general approach unless there is a strong technical reason to improve it.

---

# 6. Important Issue Already Fixed

The API route initially used:

```ts
import { pool } from "@/lib/db";
```

but the TypeScript path alias was not resolving correctly.

The import was changed to:

```ts
import { pool } from "../../../../lib/db";
```

The project now successfully passes TypeScript/build compilation.

Latest successful build output included:

```text
✓ Compiled successfully
✓ Finished TypeScript
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

However, the build route output showed:

```text
Route (app)

┌ ○ /
└ ○ /_not-found
```

and did not visibly show:

```text
/api/investors
```

Therefore, inspect the existing API route and make sure Next.js correctly recognizes:

```text
src/app/api/investors/route.ts
```

Do not assume it works just because TypeScript builds.

---

# 7. Immediate Priority

Before implementing every feature, inspect the existing project.

Run:

```bash
pwd
find src -maxdepth 5 -type f -print
cat package.json
cat tsconfig.json
```

Inspect:

```text
src/app/page.tsx
src/app/layout.tsx
src/app/globals.css
src/app/api/investors/route.ts
src/lib/db.ts
```

Then fix the API route registration issue.

Test:

```bash
npm run build
```

Then:

```bash
npm run start
```

In another terminal:

```bash
curl "http://localhost:3000/api/investors?limit=5"
```

Expected response:

```json
{
  "data": [...],
  "nextCursor": ...,
  "hasMore": true
}
```

If the API returns:

```json
{
  "error": "Failed to fetch investors"
}
```

inspect the server-side error and fix the database connection/query.

**Never ask me to paste the database password or DATABASE_URL into chat.**

---

# 8. API Requirements

The main endpoint should be:

```text
GET /api/investors
```

Supported query parameters:

```text
search
country
city
industry
title
quality
hasEmail
hasLinkedIn
cursor
limit
```

Examples:

```text
/api/investors?search=sequoia&limit=50
```

```text
/api/investors?country=India&industry=Technology&limit=50
```

```text
/api/investors?search=AI&country=USA&industry=AI&cursor=12345&limit=50
```

Use parameterized SQL queries.

Never concatenate user input directly into SQL.

---

# 9. Cursor-Based Lazy Loading

The database contains 235k+ rows.

**Never load the complete dataset into the browser.**

Do not use huge OFFSET pagination.

Default:

```text
limit = 50
```

Maximum:

```text
limit = 100
```

Use cursor-based pagination based on the `id` primary key.

Example:

```sql
WHERE id > $cursor
ORDER BY id ASC
LIMIT $limit
```

API response:

```json
{
  "data": [...],
  "nextCursor": 12345,
  "hasMore": true
}
```

The frontend should:

1. Initially load 50 records.
2. Detect when the user approaches the bottom.
3. Fetch the next 50.
4. Append them.
5. Continue until `hasMore === false`.

Use `IntersectionObserver`, preferably with something like:

```text
rootMargin: 400px
```

Avoid duplicate concurrent requests.

---

# 10. Global Search

Implement a global search field.

Search across:

```text
first_name
last_name
company_name
title
email
industry
city
country
```

MVP can use PostgreSQL `ILIKE`.

Example:

```sql
(
    first_name ILIKE $1
    OR last_name ILIKE $1
    OR company_name ILIKE $1
    OR title ILIKE $1
    OR email ILIKE $1
    OR industry ILIKE $1
    OR city ILIKE $1
    OR country ILIKE $1
)
```

Because the dataset is large and this will be used frequently, evaluate PostgreSQL trigram indexes or another efficient search approach.

Do not over-engineer before measuring.

---

# 11. Filters

Implement these filters:

### Country
Searchable/select dropdown.

### City
Searchable city filter.

### Industry
Searchable/select dropdown.

### Title
Search/filter by title.

### Quality
Filter by quality.

### Has Email

Options:

```text
All
Has Email
No Email
```

### Has LinkedIn

Options:

```text
All
Has LinkedIn
No LinkedIn
```

Filters should be designed so more filters can be added later.

---

# 12. Dynamic Filter Values

Do not permanently hard-code all countries and industries.

Create an endpoint such as:

```text
/api/investors/filters
```

or:

```text
/api/filters
```

Return:

```json
{
  "countries": [...],
  "industries": [...],
  "qualities": [...]
}
```

For very large datasets, query distinct values efficiently and cache them if appropriate.

The frontend should populate filters dynamically.

---

# 13. Results Table

Build a professional data table with at least:

```text
Name
Company
Title
Industry
Location
Email
LinkedIn
Website
Quality
```

Keep the table usable and avoid excessive width.

Clicking an investor should open a detail drawer.

Example:

```text
┌───────────────────────────────────────────────────────────────┐
│ Name              Company          Title        Industry      │
├───────────────────────────────────────────────────────────────┤
│ John Smith        ABC Ventures     Partner      SaaS          │
│ Jane Doe          XYZ Capital      Principal    AI            │
└───────────────────────────────────────────────────────────────┘
```

---

# 14. Investor Detail Drawer

Clicking a row should open a right-side drawer/modal.

Display:

```text
Full Name
Title
Company
Email
LinkedIn
Quality
Industry
Website
Company LinkedIn
City
Country
```

Hide empty fields where appropriate.

Clickable links should open safely in a new tab:

```html
target="_blank"
rel="noopener noreferrer"
```

Email should use:

```text
mailto:
```

---

# 15. Main Dashboard UI

The dashboard should roughly look like:

```text
┌───────────────────────────────────────────────────────────────┐
│ Investor Database                         235,675 Investors  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ 🔍 Search investors...                                       │
│                                                               │
│ Country ▼   Industry ▼   Title ▼   Quality ▼                │
│ Has Email ▼   Has LinkedIn ▼                 Reset Filters   │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ Results                                                      │
│                                                               │
│ Name | Company | Title | Industry | Location | Links        │
│                                                               │
│ ...                                                           │
│ ...                                                           │
│ ...                                                           │
│                                                               │
│             Loading more...                                  │
└───────────────────────────────────────────────────────────────┘
```

---

# 16. Design Requirements

The UI should feel like a modern SaaS/data platform.

Use:

```text
Next.js
TypeScript
Tailwind CSS
```

A component library may be introduced if useful, but do not unnecessarily complicate the application.

Design goals:

- Clean
- Modern
- Professional
- Fast
- Desktop-first but responsive
- Easy to scan large datasets
- Good spacing
- Clear filters
- Sticky header
- Loading states
- Empty states
- Error states
- Skeleton loaders
- Smooth detail drawer
- Good typography

Do not leave the default Next.js starter design.

---

# 17. Search UX

Do not query the API on every keystroke.

Implement a debounce around:

```text
300–500ms
```

When search/filter state changes:

1. Reset the current results.
2. Reset the cursor.
3. Fetch the first 50.
4. Replace the table.
5. Continue lazy loading from the new cursor.

Never append old results to a new search.

---

# 18. Loading and Error States

### Initial loading

Show skeleton rows.

### Loading more

Show a small loader at the bottom.

### Empty results

Show:

```text
No investors found.

Try changing your search or filters.
```

### API error

Show:

```text
Something went wrong while loading investors.
Try again.
```

with a retry button.

---

# 19. Filter Reset

Provide:

```text
Reset Filters
```

It should reset:

```text
search
country
city
industry
title
quality
hasEmail
hasLinkedIn
```

Then reload the first page.

---

# 20. URL State

Prefer storing filter/search state in URL query parameters.

Example:

```text
/investors?search=AI&country=India&industry=SaaS
```

Benefits:

- Refresh keeps filters
- Searches can be shared
- Browser back/forward works
- Saved searches can be added later

Implement this cleanly without triggering excessive API requests.

---

# 21. Performance Requirements

Dataset:

```text
235,675+
```

Therefore:

- Never load all rows.
- Never send all rows to the browser.
- Use cursor pagination.
- Select only required columns.
- Use indexes appropriately.
- Debounce search.
- Avoid unnecessary React re-renders.
- Avoid thousands of DOM nodes where possible.
- Consider virtualization later if necessary.
- Keep database pooling safe for Vercel/serverless.
- Reuse the database pool where appropriate.

---

# 22. Stats

The header should eventually show the actual total investor count rather than hard-coding it.

Consider a lightweight endpoint:

```text
/api/stats
```

Response:

```json
{
  "totalInvestors": 235675
}
```

Do not execute an expensive count on every `/api/investors` request.

Cache it or query it separately.

---

# 23. Security

The database connection must remain server-side.

Never use:

```text
NEXT_PUBLIC_DATABASE_URL
```

Never instantiate PostgreSQL from client-side code.

The browser should communicate with API routes only:

```text
/api/investors
/api/investors/filters
/api/stats
```

Validate query parameters.

Use parameterized SQL.

Never interpolate user input directly into SQL.

---

# 24. Vercel Deployment

The application will eventually be deployed to Vercel.

Production should use:

```text
DATABASE_URL
```

as a Vercel environment variable.

Never commit `.env.local`.

Ensure `.gitignore` contains at least:

```text
.env.local
```

Prefer:

```text
.env*
```

if compatible with the project.

---

# 25. Future Features

Do not necessarily implement all of these now, but structure the code so they can be added.

## Bulk selection

```text
Select all
Select visible
Bulk actions
```

## CSV export

Future endpoint:

```text
/api/investors/export
```

Export filtered results server-side rather than loading 235k records into the browser.

## Saved searches

Store:

```text
Search
Filters
Name
```

## Investor lists

Examples:

```text
AI Investors
India Investors
US VC
Angel Investors
```

## Dashboard statistics

Potential metrics:

```text
Total investors
Countries
Industries
Investors with email
Investors with LinkedIn
```

## Authentication

Eventually protect the dashboard with authentication.

## Admin/import system

Eventually:

```text
Upload Excel
↓
Standardize
↓
Validate
↓
Deduplicate
↓
Import
↓
Show import history
```

Do not build the import system now unless necessary.

---

# 26. Important Duplicate Issue

The current `investors` table does not have a database-level unique constraint for duplicates.

Historical imports were deduplicated using priority:

1. Lowercased email
2. Lowercased LinkedIn
3. First name + last name + company name

If an import system is built later, do not blindly insert duplicate rows.

Create a proper deduplication strategy and ideally database-level protection.

---

# 27. Current Code Quality Requirements

Do not recreate the application from scratch.

First:

```text
inspect
→ understand
→ modify
→ test
→ fix
→ test again
```

Actually edit the files and implement functionality rather than only explaining what code should be written.

After implementation:

```bash
npm run build
```

must pass without TypeScript/build errors.

Then run the application and test the API.

If something fails, diagnose the actual error from the project.

Do not guess.

---

# 28. Final Target Architecture

The application should ultimately work like this:

```text
                 INVESTOR DATABASE
                        │
                        ▼
             ┌─────────────────────┐
             │ Search Investors... │
             └─────────────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
     Country         Industry          Quality
        │               │                │
        └───────────────┼────────────────┘
                        ▼
                 Filtered Results
                        │
                        ▼
              ┌──────────────────┐
              │ Investor Table   │
              │                  │
              │ 50 records       │
              └──────────────────┘
                        │
                  scroll down
                        │
                        ▼
              fetch next 50 records
                        │
                        ▼
              append to existing list
                        │
                  scroll again
                        │
                        ▼
              fetch next 50...
```

The database contains **235,675+ investors**, so pagination and performance are critical.

---

# 29. Implementation Order

Follow this order:

```text
1. Inspect existing codebase
        ↓
2. Fix / verify /api/investors
        ↓
3. Verify Neon database connection
        ↓
4. Test API with curl
        ↓
5. Build robust investor search API
        ↓
6. Add filter support
        ↓
7. Add dynamic filter values
        ↓
8. Build modern dashboard UI
        ↓
9. Connect UI to API
        ↓
10. Add cursor-based infinite/lazy loading
        ↓
11. Add search debounce
        ↓
12. Add investor detail drawer
        ↓
13. Add loading/error/empty states
        ↓
14. Add URL query state
        ↓
15. Optimize database queries/indexes
        ↓
16. Run production build
        ↓
17. Test production server
        ↓
18. Prepare Vercel deployment
```

---

# 30. Success Criteria

The MVP is successful when:

- `/api/investors` works.
- It connects securely to Neon.
- It returns 50 records by default.
- Cursor pagination works.
- Search works.
- Country filtering works.
- Industry filtering works.
- Title filtering works.
- Quality filtering works.
- Has Email filtering works.
- Has LinkedIn filtering works.
- Multiple filters work together.
- Filter reset works.
- Results load progressively.
- Browser never receives all 235k records.
- Investor detail drawer works.
- Loading/error/empty states work.
- `npm run build` succeeds.
- No database credentials are exposed client-side.
- The app is ready for Vercel deployment.

---

## Start Now

**Start by inspecting the existing codebase and fixing the `/api/investors` route. Do not recreate the application from scratch.**

After fixing the route, test it against the real Neon database and then continue through the implementation order above.

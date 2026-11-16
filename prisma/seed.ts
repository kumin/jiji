import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { IssuePriority, IssueStatus } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * Demo teammates so the board has assignees before anyone signs in. Real users
 * are created by Auth.js on first Google login and join these.
 */
const USERS = [
  { name: "Ada Lovelace", email: "ada@example.com", color: "#6366f1" },
  { name: "Grace Hopper", email: "grace@example.com", color: "#ec4899" },
  { name: "Alan Turing", email: "alan@example.com", color: "#14b8a6" },
  { name: "Katherine Johnson", email: "katherine@example.com", color: "#f59e0b" },
];

type SeedIssue = {
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeEmail?: string;
  dueInDays?: number;
};

const ISSUES: SeedIssue[] = [
  {
    title: "Define the issue workflow states",
    description:
      "Agree on To Do / In Progress / In Review / Done and document which transitions are legal.",
    status: IssueStatus.DONE,
    priority: IssuePriority.HIGH,
    assigneeEmail: "ada@example.com",
  },
  {
    title: "Model issues, users and priority in Postgres",
    status: IssueStatus.DONE,
    priority: IssuePriority.HIGHEST,
    assigneeEmail: "grace@example.com",
  },
  {
    title: "Build the issue list view with filters",
    description: "Filter by status, priority and assignee. Keep counts stable while filtering.",
    status: IssueStatus.IN_REVIEW,
    priority: IssuePriority.MEDIUM,
    assigneeEmail: "alan@example.com",
  },
  {
    title: "Add a Kanban board with drag and drop",
    description: "Columns per status. Grey out columns the dragged card cannot legally reach.",
    status: IssueStatus.IN_PROGRESS,
    priority: IssuePriority.HIGH,
    assigneeEmail: "ada@example.com",
    dueInDays: 5,
  },
  {
    title: "Enforce workflow rules on the server",
    description: "The transition endpoint must reject illegal moves with a 409.",
    status: IssueStatus.IN_PROGRESS,
    priority: IssuePriority.HIGHEST,
    assigneeEmail: "grace@example.com",
  },
  {
    title: "Add due dates and overdue highlighting",
    status: IssueStatus.TODO,
    priority: IssuePriority.LOW,
  },
  {
    title: "Issue detail page with edit form",
    status: IssueStatus.TODO,
    priority: IssuePriority.MEDIUM,
    assigneeEmail: "katherine@example.com",
  },
  {
    title: "Search issues by title and description",
    status: IssueStatus.TODO,
    priority: IssuePriority.LOW,
    assigneeEmail: "alan@example.com",
  },
  {
    title: "Soft delete with an archive view",
    description: "Consider deletedAt instead of a hard delete so tickets can be recovered.",
    status: IssueStatus.TODO,
    priority: IssuePriority.LOWEST,
  },
  {
    title: "Bulk edit status from the list view",
    status: IssueStatus.TODO,
    priority: IssuePriority.MEDIUM,
    assigneeEmail: "katherine@example.com",
    dueInDays: 21,
  },
  {
    title: "Export issues to CSV",
    status: IssueStatus.TODO,
    priority: IssuePriority.LOW,
  },
  {
    title: "Notifications when an issue is assigned",
    status: IssueStatus.TODO,
    priority: IssuePriority.LOWEST,
  },
];

async function main() {
  // Idempotent: re-running the seed tops the database back up to a known state.
  // Auth-owned tables cascade from User, so clearing users is enough.
  await prisma.issue.deleteMany();
  await prisma.user.deleteMany();

  // deleteMany leaves the identity sequence where it was, which would make the
  // sample issues JIJI-27 and upwards. Restart it so a reseed always reads
  // JIJI-1 … JIJI-12.
  await prisma.$executeRawUnsafe('ALTER SEQUENCE "Issue_number_seq" RESTART WITH 1');

  const users = new Map<string, string>();
  for (const user of USERS) {
    const created = await prisma.user.create({ data: user });
    users.set(user.email, created.id);
  }

  const firstUserId = users.get(USERS[0].email)!;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const issue of ISSUES) {
    await prisma.issue.create({
      data: {
        title: issue.title,
        description: issue.description ?? null,
        status: issue.status,
        priority: issue.priority,
        assigneeId: issue.assigneeEmail ? users.get(issue.assigneeEmail) : null,
        reporterId: firstUserId,
        dueDate:
          issue.dueInDays === undefined
            ? null
            : new Date(today.getTime() + issue.dueInDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  const total = await prisma.issue.count();
  console.log(`Seeded ${USERS.length} users and ${total} issues.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

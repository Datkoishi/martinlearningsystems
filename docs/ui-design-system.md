# EduAssess UI design system

## Direction

The Learnify screenshot is a visual reference for spacious three-zone composition, a light sidebar, dark illustrated hero, pastel information cards and a compact profile rail. EduAssess uses an original brand and content. The UI must never imply that DEMO data or unapproved academic frameworks are official assessments.

Five professional dashboards map to `STUDENT`, `CONTENT_EDITOR`, `ACADEMIC_REVIEWER`, `ASSESSMENT_SPECIALIST` and `MANUAL_GRADER`. `SUPER_ADMIN` is an operational permission, not a sixth dashboard. Users with multiple professional roles can switch between authorized dashboards.

## Tokens

| Token | Value | Use |
|---|---|---|
| ink | `#25242b` | Primary text and dark hero |
| muted | `#686b78` | Secondary text |
| canvas | `#f7f8fc` | Application background |
| sidebar | `#f1f2f8` | Navigation |
| surface | `#ffffff` | Cards and workspace |
| violet | `#7652d8` | Active navigation, CTA and focus |
| violet dark | `#5936b8` | Hover/pressed CTA |
| butter | `#fff0b5` | Learning cards |
| sage | `#e2eee7` | Progress and review cards |
| sky | `#ddeaff` | Information cards |
| blush | `#ffe2ed` | Illustration support |
| border | `#e8eaf0` | Dividers |

Typography uses local system sans with `Avenir Next` preference to avoid third-party font requests. Scale: hero 48–64px, page 28–36px, section 20–24px, body 14–16px. Minimum touch target: 44px. Spacing follows 4/8/12/16/20/24/32/40/48/64px. Cards use 18–24px radii; the hero uses 28px. Motion is short and disabled under `prefers-reduced-motion`.

The UI/UX Pro Max search returned an orange/blue Swiss-style proposal. The user-provided image and explicit purple/pastel direction are more specific, so this system keeps the reference's palette while using the skill's contrast, navigation and responsive guidance.

## Screens and content sources

- `/`: public landing. Product facts only; no invented adoption metrics, reviews, pricing or certification claims.
- `/login`: existing cookie/CSRF session API.
- `/register`: account access guidance because registration is intentionally unavailable; the secure CLI/admin provisioning flow stays authoritative.
- `/demo`: existing student-safe FIXED DEMO exam.
- `/dashboard/{student|editor|reviewer|specialist|grader}`: five distinct role home screens.
- `/workspace/{catalog|imports|assembly|assessment|grading}`: existing operational modules and APIs.

Student dashboard reads the public catalog. Editor reads owned assembly runs. Reviewer reads assembly and framework review queues. Specialist presents the framework workflow and opens the existing authoring workspace; there is no invented own-framework list. Grader reads assigned OPEN/COMPLETED queues. Profile shows authenticated identity; no fake activity chart or notification count is displayed. `SUPER_ADMIN` can access authorized operational tools without a sixth dashboard.

## Responsive behavior

Desktop: 247px sidebar, flexible workspace and optional 260px context rail. Tablet: sidebar thu gọn thành cột icon và context rail theo sau main content. Mobile: sidebar thành drawer, card một cột, controls tối thiểu 44px và danh sách có giới hạn. Navigation hỗ trợ URL trực tiếp và bàn phím. Mọi widget dữ liệu có loading, empty và error state.

## Art direction

Original flat editorial illustrations were generated for landing, dashboard, login and account access; an original paper-rocket mascot supports empty/help moments. They are stored as transparent WebP under `frontend/public/assets/illustrations/`. The image prompts used friendly Vietnamese learners, rounded silhouettes and lavender/pastel accents, with no typography, logo or copied UI. Small symbols and navigation icons are code-native SVG.

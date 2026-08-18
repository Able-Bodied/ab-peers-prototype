PostgreSQL provides the core relational database engine for complex queries and data integrity, while Supabase adds instant auto-generated APIs, authentication, file storage, and real-time synchronization on top to eliminate custom backend boilerplate.

---

**Core Tech Comparison**

| Dimension | Raw PostgreSQL | Supabase |
| :--- | :--- | :--- |
| **Scope** | Relational database engine | Full-stack backend suite (built on Postgres) |
| **Out-of-Box Features** | Database engine only | DB, Auth, Auto REST/GraphQL APIs, File Storage, Realtime |
| **Backend Dev Effort** | **High:** Must build custom APIs, auth, & middleware | **Low:** Client SDKs query DB directly via auto-generated APIs |
| **Best Fit** | Applications with existing custom backend servers | Client-first web and mobile applications (e.g., React PWAs) |

---

**Cost and Deployment of Supabase Database**

| Phase | Endpoint & Connectivity | Tier | Monthly Cost | Capacity / Limits | Strategic Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1 (testing)** | Dynamic IP address to local machine | **Local (Docker)** | **$0** | Unlimited (hardware-bound) | Local development, scraper execution, and schema design. |
| **Phase 2 (real users)** | Real web endpoint with HTTPS | **Hosted Free** | **$0** | 500 MB DB \| 50k Users \| 5 GB Egress | Initial public launch and testing (**pauses after 7 days idle**). |

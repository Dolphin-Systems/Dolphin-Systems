CREATE TABLE IF NOT EXISTS catalog_items (
  slug TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('product','service')),
  title TEXT NOT NULL,
  kicker TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS catalog_ratings (
  item_slug TEXT NOT NULL,
  ip TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (item_slug, ip),
  FOREIGN KEY (item_slug) REFERENCES catalog_items(slug) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_catalog_kind ON catalog_items(kind);

INSERT OR IGNORE INTO catalog_items (slug, kind, title, kicker, icon, body) VALUES
('flowtrack','product','FlowTrack','SAMPLE 01','◉','A sample operations dashboard that follows every task from request to done, so nothing gets lost between people. FlowTrack gives each task a clear owner, a visible status, and a history you can actually follow — without digging through chat threads or spreadsheets.'),
('syncbridge','product','SyncBridge','SAMPLE 02','⇄','A sample integration layer that moves data between your CRM, inbox, and spreadsheets without manual copying. SyncBridge keeps the tools you already use in agreement, so the same customer never looks different in two places.'),
('pulsereport','product','PulseReport','SAMPLE 03','◈','A sample weekly summary of what moved, what got stuck, and what needs attention, in one clear page. PulseReport turns raw activity into a short briefing you can read in two minutes every Monday.'),
('workflow-mapping','service','Workflow mapping','SAMPLE 01','✎','A sample engagement where we document how work actually moves through your team, then mark exactly what to automate. You get a clear map of every step, handoff, and exception — and a short list of the changes worth making first.'),
('systems-integration','service','Systems integration','SAMPLE 02','🔗','A sample engagement where we connect the tools you already use, so information arrives where it is needed. We design the data flow, build the bridges, and test them against your real workload before anything goes live.'),
('automation-build','service','Automation build','SAMPLE 03','⚙','A sample engagement where we design, build, and test the workflow with your team, then hand over the keys. You get a working automation, documentation your team can follow, and a handover session so nothing depends on us.');

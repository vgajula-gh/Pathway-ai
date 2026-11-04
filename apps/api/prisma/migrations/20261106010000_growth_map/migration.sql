-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "catalogVersion" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "StudentSkill" (
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "areaOverride" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("studentId", "skillId"),
    CONSTRAINT "StudentSkill_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "stage" TEXT,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillEvidence_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillEvidence_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillTagSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'rule',
    "status" TEXT NOT NULL,
    CONSTRAINT "SkillTagSuggestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillTagSuggestion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrowthFocus" (
    "studentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    PRIMARY KEY ("studentId", "month"),
    CONSTRAINT "GrowthFocus_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GrowthFocus_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrowthReview" (
    "studentId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "occurredOn" TEXT,
    "sourceState" TEXT NOT NULL DEFAULT '',
    "linkedMilestoneId" TEXT,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("studentId", "sourceType", "sourceId"),
    CONSTRAINT "GrowthReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SkillRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SkillEvidence_studentId_skillId_idx" ON "SkillEvidence"("studentId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillEvidence_studentId_sourceType_sourceId_skillId_key" ON "SkillEvidence"("studentId", "sourceType", "sourceId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillTagSuggestion_studentId_sourceType_sourceId_skillId_key" ON "SkillTagSuggestion"("studentId", "sourceType", "sourceId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillRequest_studentId_name_key" ON "SkillRequest"("studentId", "name");


-- Stable catalog IDs; no student data is backfilled or confirmed by this migration.
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('coding','Coding','STEM','["python", "programming", "coding", "javascript", "java", "c++", "scratch"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('data-statistics','Data & statistics','STEM','["data analysis", "statistics", "statistical", "data science"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('biology','Biology','STEM','["biology", "biological", "ecology", "genetics"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('chemistry','Chemistry','STEM','["chemistry", "chemical"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('physics','Physics','STEM','["physics", "mechanics", "forces"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('math','Math','STEM','["math", "mathematics", "algebra", "geometry", "calculus"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('research','Research','STEM','["research", "investigation", "investigate"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('scientific-experimentation','Scientific experimentation','STEM','["experiment", "laboratory", "lab notebook"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('environmental-science','Environmental science','STEM','["environmental science", "climate science", "biodiversity"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('astronomy','Astronomy','STEM','["astronomy", "space", "telescope"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('critical-thinking','Critical thinking','STEM','["critical thinking", "evaluate evidence", "analyze arguments"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('problem-solving','Problem solving','STEM','["problem solving", "problem-solving", "troubleshoot", "debug"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('robotics','Robotics','Engineering & tech','["robotics", "robot", "drivetrain"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('cad-making','CAD & making','Engineering & tech','["cad", "3d printing", "3d modeling", "fabrication"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('electronics','Electronics','Engineering & tech','["electronics", "circuit", "arduino"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('ai-ml','AI/ML','Engineering & tech','["artificial intelligence", "machine learning", "ai", "neural network"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('web-app-development','Web & app development','Engineering & tech','["web development", "app development", "website", "web app", "mobile app"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('cybersecurity','Cybersecurity','Engineering & tech','["cybersecurity", "cyber security", "network security"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('engineering-design','Engineering design','Engineering & tech','["engineering design", "engineering", "mechanical design"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('prototyping','Prototyping','Engineering & tech','["prototype", "prototyping"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('software-testing','Software testing','Engineering & tech','["software testing", "unit test", "test suite"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('digital-literacy','Digital literacy','Engineering & tech','["digital literacy", "computer basics"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('game-development','Game development','Engineering & tech','["game development", "video game design"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('technical-documentation','Technical documentation','Engineering & tech','["technical documentation", "user guide", "technical manual"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('entrepreneurship','Entrepreneurship','Business','["entrepreneurship", "entrepreneur", "startup", "business plan", "clothing brand"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('marketing','Marketing','Business','["marketing", "advertising", "brand campaign"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('finance-basics','Finance basics','Business','["finance", "budgeting", "financial literacy"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('product-design','Product design','Business','["product design", "product mockup"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('business-planning','Business planning','Business','["business planning", "business model"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('customer-research','Customer research','Business','["customer research", "customer interviews"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('sales','Sales','Business','["sales", "selling", "fundraising sales"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('operations','Operations','Business','["operations", "inventory", "logistics"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('economics','Economics','Business','["economics", "economic policy"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('project-management','Project management','Business','["project management", "project planning"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('visual-design','Visual design','Creative','["visual design", "graphic design", "poster design"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('writing','Writing','Creative','["writing", "creative writing", "story", "essay"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('music','Music','Creative','["music", "orchestra", "band", "piano", "guitar", "choir"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('photography-video','Photography & video','Creative','["photography", "video", "filmmaking", "film editing"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('fashion-design','Fashion design','Creative','["fashion design", "clothing design"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('drawing-painting','Drawing & painting','Creative','["drawing", "painting", "illustration"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('theater','Theater','Creative','["theater", "theatre", "acting", "drama"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('dance','Dance','Creative','["dance", "choreography"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('animation','Animation','Creative','["animation", "stop motion"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('creative-thinking','Creative thinking','Creative','["creative thinking", "brainstorming", "creativity"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('architecture','Architecture','Creative','["architecture", "architectural design"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('craft-fabrication','Craft & fabrication','Creative','["craft", "sewing", "woodworking"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('leadership','Leadership','Leadership & service','["leadership", "team leader", "club president", "led a team"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('teamwork','Teamwork','Leadership & service','["teamwork", "collaboration", "worked together", "team project"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('volunteering','Volunteering','Leadership & service','["volunteering", "volunteer", "food bank", "community service"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('community-organizing','Community organizing','Leadership & service','["community organizing", "community event", "neighborhood event"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('mentoring','Mentoring','Leadership & service','["mentoring", "mentor"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('event-planning','Event planning','Leadership & service','["event planning", "organized an event", "organize an event"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('time-management','Time management','Leadership & service','["time management", "study schedule"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('initiative','Initiative','Leadership & service','["initiative", "self-started", "started a club"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('conflict-resolution','Conflict resolution','Leadership & service','["conflict resolution", "mediation"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('advocacy','Advocacy','Leadership & service','["advocacy", "advocate", "awareness campaign"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('decision-making','Decision making','Leadership & service','["decision making", "decision-making"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('peer-tutoring','Peer tutoring','Leadership & service','["tutoring", "peer tutor"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('communication','Communication','Communication','["communication", "communicating"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('public-speaking','Public speaking','Communication','["public speaking", "speech", "speaking to an audience"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('debate','Debate','Communication','["debate", "debating"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('presenting','Presenting','Communication','["presentation", "presenting", "showcase", "demonstration"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('persuasive-writing','Persuasive writing','Communication','["persuasive writing", "opinion article", "argumentative essay"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('active-listening','Active listening','Communication','["active listening", "listening skills"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('interviewing','Interviewing','Communication','["interviewing", "interview"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('storytelling','Storytelling','Communication','["storytelling", "narrative"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('editing','Editing','Communication','["editing", "proofreading", "copyediting"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('language-learning','Language learning','Communication','["language learning", "spanish", "french", "mandarin", "sign language"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('negotiation','Negotiation','Communication','["negotiation", "negotiate"]',true,1);
INSERT INTO "Skill" ("id","name","area","synonyms","active","catalogVersion") VALUES ('science-communication','Science communication','Communication','["science communication", "science outreach"]',true,1);

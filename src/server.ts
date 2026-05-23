import express, { type Application, type Request, type Response } from "express";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"; // bcrypt ইমপোর্ট করা হয়েছে

const app: Application = express();
const port = 5000;
const JWT_SECRET = "your_super_secret_key_123";

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
    connectionString: "postgresql://neondb_owner:npg_YL3H2bcGIJvp@ep-raspy-scene-apdbzzye-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
});


const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users(
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'contributor' NOT NULL CHECK (role IN ('contributor', 'maintainer')),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
    } catch (error) {
        console.log(error);
    }
};
initDB();

const issueeDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS issues(
                id SERIAL PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                description TEXT NOT NULL,
                type VARCHAR(50) NOT NULL CHECK (type IN ('bug', 'feature_request')),
                status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
                reporter_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
    } catch (error) {
        console.log(error);
    }
};
issueeDB();


app.post("/api/auth/signup", async (req: Request, res: Response) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: "Required fields are missing" });
    }

    try {
        
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(`
            INSERT INTO users(name, email, password, role) VALUES($1, $2, $3, $4)
            RETURNING id, name, email, role, created_at, updated_at
        `, [name, email, hashedPassword, role || 'contributor']);

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: result.rows[0] // এখানে আর পাসওয়ার্ড এক্সপোজ হবে না
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message, error: error });
    }
});

// ২. ইউজার লগইন (Bcrypt Compare সহ)
app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const user = result.rows[0];

        // হ্যাশ করা পাসওয়ার্ডের সাথে ম্যাচ করানো
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }

        const tokenPayload = { id: user.id, name: user.name, role: user.role };
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1d" });

        const { password: _, ...userWithoutPassword } = user;

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: { token, user: userWithoutPassword }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message, error: error });
    }
});

// অথেনটিকেশন মিডলওয়্যার
const authMiddleware = (req: Request, res: Response, next: any) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ success: false, message: "Authorization header is missing" });
    }

    try {
        const decoded = jwt.verify(authHeader, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }
};

// ৩. ক্রিয়েট ইস্যু (ইনপুট ভ্যালিডেশন সহ)
app.post("/api/issues", authMiddleware, async (req: any, res: Response) => {
    const { title, description, type } = req.body;
    const reporter_id = req.user.id;

    // অ্যাসাইনমেন্টের শর্ত অনুযায়ী ভ্যালিডেশন
    if (!title || title.length > 150) {
        return res.status(400).json({ success: false, message: "Title is required and must be under 150 characters" });
    }
    if (!description || description.length < 20) {
        return res.status(400).json({ success: false, message: "Description must be at least 20 characters long" });
    }
    if (!type || (type !== 'bug' && type !== 'feature_request')) {
        return res.status(400).json({ success: false, message: "Type must be either 'bug' or 'feature_request'" });
    }

    try {
        const result = await pool.query(`
            INSERT INTO issues (title, description, type, reporter_id) 
            VALUES ($1, $2, $3, $4) 
            RETURNING id, title, description, type, status, reporter_id, created_at, updated_at
        `, [title, description, type, reporter_id]);

        res.status(201).json({
            success: true,
            message: "Issue created successfully",
            data: result.rows[0]
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message, error: error });
    }
});

// ৪. গেট অল ইস্যুস (ফিল্টারিং ও ব্যাচিং সহ)
app.get("/api/issues", async (req: Request, res: Response) => {
    const { sort, type, status } = req.query;

    try {
        let queryText = `SELECT id, title, description, type, status, reporter_id, created_at, updated_at FROM issues WHERE 1=1`;
        const queryParams: any[] = [];

        if (type) {
            queryParams.push(type);
            queryText += ` AND type = $${queryParams.length}`;
        }
        if (status) {
            queryParams.push(status);
            queryText += ` AND status = $${queryParams.length}`;
        }
        queryText += sort === "oldest" ? ` ORDER BY created_at ASC` : ` ORDER BY created_at DESC`;

        const issuesResult = await pool.query(queryText, queryParams);
        const issues = issuesResult.rows;

        if (issues.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const reporterIds = Array.from(new Set(issues.map(issue => issue.reporter_id)));
        const usersResult = await pool.query(`SELECT id, name, role FROM users WHERE id = ANY($1)`, [reporterIds]);

        const userMap = usersResult.rows.reduce((acc: any, user: any) => {
            acc[user.id] = user;
            return acc;
        }, {});

        const formattedData = issues.map(issue => {
            const { reporter_id, ...issueData } = issue;
            return { ...issueData, reporter: userMap[reporter_id] || null };
        });

        res.status(200).json({ success: true, data: formattedData });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message, error: error });
    }
});

// ৫. গেট সিঙ্গেল ইস্যু
app.get("/api/issues/:id", async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const issueResult = await pool.query(
            `SELECT id, title, description, type, status, reporter_id, created_at, updated_at FROM issues WHERE id = $1`,
            [id]
        );

        if (issueResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Issue not found" });
        }

        const issue = issueResult.rows[0];
        const userResult = await pool.query(`SELECT id, name, role FROM users WHERE id = $1`, [issue.reporter_id]);
        const { reporter_id, ...issueData } = issue;

        res.status(200).json({
            success: true,
            data: { ...issueData, reporter: userResult.rows[0] || null }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message, error: error });
    }
});

// ৬. আপডেট ইস্যু (কন্ডিশনাল পারমিশন সহ)
app.patch("/api/issues/:id", authMiddleware, async (req: any, res: Response) => {
    const { id } = req.params;
    const { title, description, type } = req.body;
    const { id: userId, role: userRole } = req.user;

    try {
        const issueResult = await pool.query("SELECT * FROM issues WHERE id = $1", [id]);

        if (issueResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Issue not found" });
        }

        const issue = issueResult.rows[0];

        if (userRole === "contributor") {
            if (issue.reporter_id !== userId) {
                return res.status(403).json({ success: false, message: "You are not authorized to update this issue" });
            }
            if (issue.status !== "open") {
                return res.status(403).json({ success: false, message: "Contributors can only update issues with an 'open' status" });
            }
        }

        const updatedTitle = title !== undefined ? title : issue.title;
        const updatedDescription = description !== undefined ? description : issue.description;
        const updatedType = type !== undefined ? type : issue.type;

        const updateResult = await pool.query(`
            UPDATE issues 
            SET title = $1, description = $2, type = $3, updated_at = NOW() 
            WHERE id = $4 
            RETURNING id, title, description, type, status, reporter_id, created_at, updated_at
        `, [updatedTitle, updatedDescription, updatedType, id]);

        res.status(200).json({
            success: true,
            message: "Issue updated successfully",
            data: updateResult.rows[0]
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message, error: error });
    }
});

// ৭. ডিলিট ইস্যু
app.delete("/api/issues/:id", authMiddleware, async (req: any, res: Response) => {
    const { id } = req.params;
    const { role: userRole } = req.user;

    try {
        if (userRole !== "maintainer") {
            return res.status(403).json({ success: false, message: "Access denied. Only maintainers can delete issues." });
        }

        const checkIssue = await pool.query("SELECT id FROM issues WHERE id = $1", [id]);

        if (checkIssue.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Issue not found" });
        }

        await pool.query("DELETE FROM issues WHERE id = $1", [id]);

        res.status(200).json({ success: true, message: "Issue deleted successfully" });
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message, error: error });
    }
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
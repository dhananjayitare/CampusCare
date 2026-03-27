const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const path = require("path");

const app = express();

// ================= MIDDLEWARE =================
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "mysecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// ================= DATABASE =================
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "0902",
  database: "complaint_db"
});

db.connect(err => {
  if (err) console.log(err);
  else console.log("MySQL Connected ✅");
});

// ================= AUTH CHECK =================
function checkAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  next();
}

// ================= REGISTER =================
app.post("/register", (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role)
    return res.send("All fields required ❌");

  const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";

  db.query(sql, [name, email, password, role.toLowerCase()], (err) => {
    if (err) {
      console.log(err);
      return res.send("Email already exists ❌");
    }
    res.redirect("/login.html");
  });
});

// ================= LOGIN =================
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.send("All fields required ❌");

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {

    if (err) {
      console.log(err);
      return res.send("Database Error ❌");
    }

    if (results.length === 0) {
      console.log("User not found");
      return res.send("Email Not Found ❌");
    }

    const user = results[0];
    console.log("Logged User:", user);

    if (user.password !== password)
      return res.send("Wrong Password ❌");

    req.session.user = user;

    if (user.role === "admin")
      return res.redirect("/admindash");

    if (user.role === "maintenance")
      return res.redirect("/maintenance");

    return res.redirect("/dashboard");
  });
});

// ================= admin history get =================
app.get("/admin/complaints", (req, res) => {
    const query = `SELECT c.id, s.name, c.complaint_text, c.status, c.created_at 
                   FROM complaints c
                   JOIN students s ON c.student_id = s.id
                   ORDER BY c.created_at DESC`;

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
        res.json(results);
    });
});


app.get("/get-user", checkAuth, (req, res) => {
  res.json(req.session.user);
});

// ================= DASHBOARD =================
app.get("/dashboard", checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// ================= ADMIN =================
app.get("/admindash", (req, res) => {
  const filePath = path.resolve(__dirname, "public", "admindash.html");
  console.log("Sending file:", filePath);

  res.sendFile(filePath, (err) => {
    if (err) {
      console.log("SendFile Error:", err);
      res.status(err.status || 500).send("File not found ❌");
    }
  });
});

// ================= MAINTENANCE =================
app.get("/maintenance", checkAuth, (req, res) => {
  if (req.session.user.role !== "maintenance")
    return res.redirect("/dashboard");

  res.sendFile(path.join(__dirname, "public", "maintenance.html"));
});

// ================= SUBMIT COMPLAINT =================
app.post("/submit-complaint", checkAuth, (req, res) => {

  const { title, description } = req.body;

  if (!title || !description)
    return res.json({ message: "All fields required ❌" });

  const sql = `
    INSERT INTO complaints (user_id, title, description, status)
    VALUES (?, ?, ?, 'Pending')
  `;

  db.query(sql, [req.session.user.id, title, description], (err) => {
    if (err) {
      console.log(err);
      return res.json({ message: "Database error ❌" });
    }

    res.json({ message: "Complaint submitted successfully ✅" });
  });

});

// ================= GET ALL COMPLAINTS (ADMIN) =================
app.get("/api/complaints", checkAuth, (req, res) => {

  if (req.session.user.role !== "admin")
    return res.status(403).json({ message: "Unauthorized" });

  const sql = `
    SELECT complaints.*, users.name
    FROM complaints
    JOIN users ON complaints.user_id = users.id
    ORDER BY created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.json([]);
    res.json(results);
  });
});


// ================= store users=================
app.get("/api/users", checkAuth, (req, res) => {

  if (req.session.user.role !== "admin")
    return res.status(403).json([]);

  db.query("SELECT id, name, email, role FROM users", (err, results) => {

    if (err) {
      console.log(err);
      return res.json([]);
    }

    res.json(results);

  });

});


// ================= student history =============

app.get("/api/my-complaints", checkAuth, (req, res) => {

  const sql = `
    SELECT title, description, status, created_at
    FROM complaints
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [req.session.user.id], (err, results) => {
    if (err) {
      console.log(err);
      return res.json([]);
    }
    res.json(results);
  });

});

// ================= ASSIGN TO MAINTENANCE =================
app.put("/assign/:id/:maintenanceId", checkAuth, (req, res) => {

  if (req.session.user.role !== "admin")
    return res.status(403).json({ message: "Unauthorized" });

  db.query(
    "UPDATE complaints SET assigned_to = ?, status = 'In Progress' WHERE id = ?",
    [req.params.maintenanceId, req.params.id],
    (err) => {
      if (err) return res.json({ message: "Error ❌" });
      res.json({ message: "Assigned successfully ✅" });
    }
  );
});

// ================= MAINTENANCE VIEW =================
app.get("/maintenance/complaints", checkAuth, (req, res) => {

  if (req.session.user.role !== "maintenance")
    return res.status(403).json({ message: "Unauthorized" });

  const sql = `
    SELECT complaints.*, users.name
    FROM complaints
    JOIN users ON complaints.user_id = users.id
    WHERE assigned_to = ?
  `;

  db.query(sql, [req.session.user.id], (err, results) => {
    if (err) return res.json([]);
    res.json(results);
  });
});



// =============================
// COMPLETE COMPLAINT ROUTE
// =============================
app.put("/complete-complaint/:id", checkAuth, (req, res) => {

  // Role check
  if (
    req.session.user.role !== "admin" &&
    req.session.user.role !== "maintenance"
  ) {
    return res.status(403).json({ success: false, message: "Unauthorized ❌" });
  }

  const complaintId = req.params.id;

  db.query(
    "UPDATE complaints SET status = 'Task is Completed' WHERE id = ?",
    [complaintId],
    (err, result) => {

      if (err) {
        console.log(err);
        return res.json({ success: false, message: "Database Error ❌" });
      }

      if (result.affectedRows === 0) {
        return res.json({ success: false, message: "Complaint not found ❌" });
      }

      res.json({ success: true, message: "Task is Completed ✅" });
    }
  );
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// Delete complaint — only admin
app.delete("/delete-complaint/:id", checkAuth, (req, res) => {
  if (req.session.user.role !== "admin")
    return res.status(403).json({ message: "Unauthorized ❌" });

  db.query("DELETE FROM complaints WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.json({ message: "Error deleting ❌" });
    res.json({ message: "Complaint deleted ✅" });
  });
});


app.delete("/delete-user/:id", (req, res) => {

  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ message: "Unauthorized ❌" });
  }

  const userId = req.params.id;

  if (req.session.user.id == userId) {
    return res.json({ message: "You cannot delete yourself ❌" });
  }

  // 1️⃣ Delete complaints first
  db.query("DELETE FROM complaints WHERE user_id = ?", [userId], (err) => {

    if (err) {
      console.log(err);
      return res.json({ message: "Error deleting complaints ❌" });
    }

    // 2️⃣ Then delete user
    db.query("DELETE FROM users WHERE id = ?", [userId], (err) => {

      if (err) {
        console.log(err);
        return res.json({ message: "Error deleting user ❌" });
      }

      res.json({ message: "User deleted successfully ✅" });

    });

  });

});

 
app.get("/home", (req, res) => {
    res.sendFile(__dirname + "/public/home.html");
});

app.get("/about", (req, res) => {
    res.sendFile(__dirname + "/public/about.html");
});

app.get("/contact", (req, res) => {
    res.sendFile(__dirname + "/public/contact.html");
});


// Get logged-in user info
app.get("/current-user", checkAuth, (req, res) => {
  res.json(req.session.user);
});

// chnge password
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(sql, [email, password], (err, result) => {

    if (result.length > 0) {

      req.session.userEmail = email;   // 👈 VERY IMPORTANT

      console.log("Session saved:", req.session.userEmail);

      alert("/dashboard.html");

    } else {
      res.send("Invalid login");
    }
  });
});



// ================= CONTACT FORM SUBMIT ROUTE =================

app.post("/contact-message", (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message)
    return res.json({ success: false, message: "All fields required ❌" });

  const sql = `
    INSERT INTO contact_messages (name, email, message)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [name, email, message], (err) => {
    if (err) {
      console.log(err);
      return res.json({ success: false, message: "Database error ❌" });
    }

    res.json({ success: true, message: "Message sent successfully ✅" });
  });
});

app.get("/api/contact-messages", checkAuth, (req, res) => {

  if (req.session.user.role !== "admin")
    return res.status(403).json([]);

  db.query(
    "SELECT * FROM contact_messages ORDER BY created_at DESC",
    (err, results) => {
      if (err) return res.json([]);
      res.json(results);
    }
  );
});

app.delete("/delete-message/:id", checkAuth, (req, res) => {

  if (req.session.user.role !== "admin")
    return res.status(403).json({ message: "Unauthorized ❌" });

  const id = req.params.id;

  db.query(
    "DELETE FROM contact_messages WHERE id = ?",
    [id],
    (err, result) => {

      if (err) {
        console.log(err);
        return res.json({ message: "Error deleting❌" });
      }

      if (result.affectedRows === 0) {
        return res.json({ message: "Not found ❌" });
      }

      res.json({ message: " Deleted successfully ✅" });

    }
  );

});

// ================= user to maintance =================
app.get("/api/maintenance-users", checkAuth, (req, res) => {

  if (req.session.user.role !== "admin")
    return res.status(403).json([]);

  db.query(
    "SELECT id, name FROM users WHERE role = 'maintenance'",
    (err, results) => {
      if (err) return res.json([]);
      res.json(results);
    }
  );
});

//change password route
// ================= CHANGE PASSWORD =================
app.post("/change-password", checkAuth, (req, res) => {

  const { oldPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.user.id;

  // Check all fields filled
  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.send("All fields required ❌");
  }

  // New passwords match check
  if (newPassword !== confirmPassword) {
    return res.send("New passwords do not match ❌");
  }

  // Check old password
  db.query(
    "SELECT password FROM users WHERE id = ?",
    [userId],
    (err, results) => {

      if (err) {
        console.log(err);
        return res.send("Database Error ❌");
      }

      if (results.length === 0) {
        return res.send("User not found ❌");
      }

      if (results[0].password !== oldPassword) {
        return res.send("Old password incorrect ❌");
      }

      // Update password
      db.query(
        "UPDATE users SET password = ? WHERE id = ?",
        [newPassword, userId],
        (err2) => {

          if (err2) {
            console.log(err2);
            return res.send("Password update failed ❌");
          }

          // Logout after password change
          req.session.destroy();
          res.send("Password updated successfully ✅ Please login again.");
        }
      );

    }
  );

});




async function assignComplaint(complaintId) {

  const res = await fetch("/api/maintenance-users");
  const maintenanceUsers = await res.json();

  let options = "";

  maintenanceUsers.forEach(user => {
    options += `${user.id} - ${user.name}\n`;
  });

  const selectedId = prompt(
    "Enter Maintenance ID:\n" + options
  );

  if (!selectedId) return;

  const assignRes = await fetch(`/assign/${complaintId}/${selectedId}`, {
    method: "PUT"
  });

  const data = await assignRes.json();
  alert(data.message);

  loadComplaints();
}
// ================= SERVER =================
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000 🚀");
});
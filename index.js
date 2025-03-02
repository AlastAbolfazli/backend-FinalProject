const express = require("express");
const { Client } = require("pg");
require("dotenv").config();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");
const cors = require("cors");
const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DATABASE_URL =
  "postgresql://bookingdb_owner:npg_wLlqgXz2QaW8@ep-aged-snowflake-a53w18dx-pooler.us-east-2.aws.neon.tech/bookingdb?sslmode=require";
const sql = neon(DATABASE_URL);

const port = 3001;
app.listen(port, () =>
  console.log(`My App listening at http://localhost:${port}`)
);

// app.get("/api/hotels", async (req, res) => {
//   try {
//     const query = `SELECT id, name, location, description, price, rating FROM hotels`;
//     const result = await sql(query);
//     console.log("Backend Fetched Hotels:", result);
//     res.json(result);
//   } catch (err) {
//     console.error("Error fetching hotels: ", err);
//     res.status(500).json({ error: "Failed to fetch hotels" });
//   }
// });

// app.get("/api/hotels", async (req, res) => {
//   const { location, minPrice, maxPrice, minRating, maxRating, amenities } =
//     req.query;

//   let query = `
//     SELECT name, location, description, price, rating, amenities
//     FROM hotels
//     WHERE 1=1
//   `;

//   if (location) {
//     query += ` AND location ILIKE '%${location}%'`;
//   }

//   if (minPrice && maxPrice) {
//     query += ` AND price BETWEEN ${minPrice} AND ${maxPrice}`;
//   }
//   if (minRating && maxRating) {
//     query += ` AND rating BETWEEN ${minRating} AND ${maxRating}`;
//   }
//   if (amenities) {
//     query += ` AND amenities ILIKE '%${amenities}%'`;
//   }

//   console.log("SQL Query: ", query);

//   try {
//     const result = await sql(query);
//     res.json(result);
//   } catch (err) {
//     console.error("Error fetching hotels: ", err);
//     res.status(500).json({ error: "Failed to fetch hotels" });
//   }
// });

app.get("/api/hotels", async (req, res) => {
  const { location, minPrice, maxPrice, minRating, maxRating, amenities } =
    req.query;

  let query = `
    SELECT id, name, location, description, price, rating, amenities
    FROM hotels
    WHERE 1=1
  `;

  let queryParams = [];

  if (location) {
    query += ` AND location ILIKE $${queryParams.length + 1}`;
    queryParams.push(`%${location}%`);
  }

  if (minPrice && maxPrice) {
    query += ` AND price BETWEEN $${queryParams.length + 1} AND $${
      queryParams.length + 2
    }`;
    queryParams.push(minPrice, maxPrice);
  }

  if (minRating && maxRating) {
    query += ` AND rating BETWEEN $${queryParams.length + 1} AND $${
      queryParams.length + 2
    }`;
    queryParams.push(minRating, maxRating);
  }

  if (amenities) {
    query += ` AND amenities ILIKE $${queryParams.length + 1}`;
    queryParams.push(`%${amenities}%`);
  }

  console.log("SQL Query: ", query, "Params: ", queryParams);

  try {
    const result = await sql(query, queryParams);
    res.json(result);
  } catch (err) {
    console.error("Error fetching hotels: ", err);
    res.status(500).json({ error: "Failed to fetch hotels" });
  }
});

app.post("/api/reservations", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    numberOfAdults,
    numberOfChildren,
    checkInDate,
    checkOutDate,
    roomPreference,
    specialRequests,
  } = req.body;

  const userQuery = "SELECT id FROM users WHERE email = $1";
  const userResult = await sql(userQuery, [email]);

  if (userResult.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  const user_id = userResult[0].id;
  const roomQuery = "SELECT id FROM rooms WHERE available = TRUE LIMIT 1";
  const roomResult = await sql(roomQuery);

  if (roomResult.length === 0) {
    return res.status(400).json({ error: "No available rooms" });
  }

  const room_id = roomResult[0].id;

  const query = `
    INSERT INTO reservations (
      user_id, 
      room_id,
      first_name,
      last_name,
      email,
      phone,
      number_of_adults,
      number_of_children,
      check_in_date,
      check_out_date,
      room_preference,
      special_requests
    ) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;

  const values = [
    user_id,
    room_id,
    firstName,
    lastName,
    email,
    phone,
    numberOfAdults,
    numberOfChildren,
    checkInDate,
    checkOutDate,
    roomPreference,
    specialRequests,
  ];

  try {
    await sql(query, values);
    res.status(201).json({ message: "Reservation created successfully!" });
  } catch (err) {
    console.error("Error creating reservation: ", err);
    res.status(500).json({ error: "Failed to create reservation" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await getUserByEmailAndPassword(email, password);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    "your_jwt_secret",
    { expiresIn: "1h" }
  );

  res.json({
    token,
    userId: user.id,
    email: user.email,
    isAdmin: user.email === "admin@admin.com",
  });
});

const getUserByEmailAndPassword = async (email, password) => {
  const client = new Client({
    connectionString:
      "postgresql://bookingdb_owner:npg_wLlqgXz2QaW8@ep-aged-snowflake-a53w18dx-pooler.us-east-2.aws.neon.tech/bookingdb?sslmode=require",
  });
  await client.connect();

  try {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await client.query(query, [email]);

    if (result.rows.length > 0) {
      const user = result.rows[0];

      const isPasswordCorrect = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (isPasswordCorrect) {
        return user; // Return the user object if credentials are correct
      } else {
        return null; // Password doesn't match
      }
    }
    return null; // User not found
  } catch (error) {
    console.error("Error during login:", error);
    throw error;
  } finally {
    client.end();
  }
};

// const getUserByEmail = async (email) => {
//   const client = new Client({
//     connectionString:
//       "postgresql://bookingdb_owner:npg_wLlqgXz2QaW8@ep-aged-snowflake-a53w18dx-pooler.us-east-2.aws.neon.tech/bookingdb?sslmode=require",
//   });
//   await client.connect();
//   const query = "SELECT * FROM users WHERE email = $1";
//   const values = [email];
//   try {
//     const res = await client.query(query, values);
//     return res.rows[0];
//   } catch (err) {
//     console.error("Error fetching user by email:", err);
//     throw err;
//   }
// };

const createUser = async (email, password) => {
  const client = new Client({
    connectionString:
      "postgresql://bookingdb_owner:npg_wLlqgXz2QaW8@ep-aged-snowflake-a53w18dx-pooler.us-east-2.aws.neon.tech/bookingdb?sslmode=require",
  });
  await client.connect();

  try {
    const checkUserQuery = "SELECT * FROM users WHERE email = $1";
    const userExists = await client.query(checkUserQuery, [email]);

    if (userExists.rows.length > 0) {
      return null;
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const insertUserQuery = `
      INSERT INTO users (email, password_hash) 
      VALUES ($1, $2) RETURNING id, email;
    `;
    const result = await client.query(insertUserQuery, [email, hashedPassword]);

    return result.rows[0];
  } catch (error) {
    console.error("Error creating user:", error);
    return null;
  } finally {
    client.end();
  }
};

app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;
  const user = await createUser(email, password);

  if (!user) {
    return res
      .status(400)
      .json({ error: "User creation failed. Email might be already in use." });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    "your_jwt_secret",
    { expiresIn: "1h" }
  );

  res.status(201).json({
    message: "User created successfully",
    token,
    userId: user.id,
    email: user.email,
  });
});

// app.post("/api/signup", async (req, res) => {
//   const { email, password } = req.body;
//   const user = await createUser(email, password); // Create the user in the database

//   if (!user) {
//     return res.status(400).json({ error: "User creation failed" });
//   }

//   const token = jwt.sign(
//     { userId: user.id, email: user.email },
//     "your_jwt_secret",
//     { expiresIn: "1h" }
//   );

//   res.status(201).json({
//     message: "User created successfully",
//     token,
//     userId: user.id,
//     email: user.email,
//   });
// });

app.get("/api/reservations/:email", async (req, res) => {
  const { email } = req.params;

  const query = `
    SELECT r.id, h.name as hotel_name, r.check_in_date, r.check_out_date, r.status
    FROM reservations r
    JOIN rooms ro ON r.room_id = ro.id
    JOIN hotels h ON ro.hotel_id = h.id
    JOIN users u ON r.user_id = u.id
    WHERE u.email = $1
  `;

  try {
    const result = await sql(query, [email]);
    res.json(result); // Send the booking history based on the email
  } catch (err) {
    console.error("Error fetching reservation history: ", err);
    res.status(500).json({ error: "Failed to fetch reservations" });
  }
});

app.post("/api/feedback", async (req, res) => {
  const { email, rating, comment } = req.body;

  if (!email || !rating || rating < 1 || rating > 5 || !comment.trim()) {
    return res.status(400).json({ error: "Invalid data provided." });
  }

  try {
    const userQuery = `SELECT id FROM users WHERE email = $1`;
    const userResult = await sql(userQuery, [email]);

    if (userResult.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const userId = userResult[0].id;

    const query = `
      INSERT INTO feedbacks (user_id, rating, comment)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const values = [userId, rating, comment];

    const result = await sql(query, values);

    res.status(201).json({
      message: "Feedback submitted successfully!",
      feedbackId: result[0].id,
    });
  } catch (err) {
    console.error("Error saving feedback: ", err);
    res.status(500).json({ error: "Failed to save feedback." });
  }
});

// app.get("/api/users/:email", async (req, res) => {
//   const { email } = req.params;
//   try {
//     const query = "SELECT name, email, phone FROM users WHERE email = $1";
//     const result = await sql(query, [email]);

//     if (result.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     res.json(result[0]);
//   } catch (error) {
//     res.status(500).json({ error: "Error fetching user data" });
//   }
// });

// app.put("/api/users/:email", async (req, res) => {
//   const { email } = req.params; // Current email from URL parameter
//   const { newEmail } = req.body; // New email sent in the body

//   try {
//     // Check if the new email already exists in the database
//     const checkEmailQuery = "SELECT id FROM users WHERE email = $1";
//     const emailCheckResult = await sql(checkEmailQuery, [newEmail]);

//     if (emailCheckResult.length > 0) {
//       return res.status(400).json({ error: "This email is already taken!" });
//     }

//     // Update the email in the database
//     const query = "UPDATE users SET email = $1 WHERE email = $2 RETURNING id";
//     const result = await sql(query, [newEmail, email]);

//     if (result.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     res.json({ message: "Email updated successfully!" });
//   } catch (error) {
//     res.status(500).json({ error: "Error updating email" });
//   }
// });

const authenticateAdmin = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(403).send("Access Denied");
  }

  jwt.verify(token, "your_jwt_secret", (err, decoded) => {
    if (err) {
      return res.status(403).send("Invalid Token");
    }

    req.admin = decoded;
    next();
  });
};

// const adminEmail = 'admin@admin.com';
// const adminPassword = 'koko123';

// const hashAdminPassword = async () => {
//   const salt = await bcrypt.genSalt(10);
//   const hashedPassword = await bcrypt.hash(adminPassword, salt);
//   return hashedPassword;
// };

// const setAdminPasswordInDatabase = async () => {
//   const hashedPassword = await hashAdminPassword();

//   await sql('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [adminEmail, hashedPassword]);
//   console.log("Admin password has been set.");
// };

// setAdminPasswordInDatabase();

const verifyAdminPassword = async (enteredPassword, storedHashedPassword) => {
  const isMatch = await bcrypt.compare(enteredPassword, storedHashedPassword);
  return isMatch;
};

const adminLogin = async (email, password) => {
  const user = await sql("SELECT * FROM users WHERE email = $1", [email]);

  if (!user) {
    return null;
  }

  const isPasswordValid = await verifyAdminPassword(
    password,
    user.password_hash
  );

  if (!isPasswordValid) {
    return null;
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email },
    "your_jwt_secret",
    { expiresIn: "1h" }
  );
  return token;
};

app.post("/api/hotels", authenticateAdmin, async (req, res) => {
  const { name, location, description, price, rating } = req.body;

  const query = `
        INSERT INTO hotels (name, location, description, price, rating)
        VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;

  try {
    const result = await sql(query, [
      name,
      location,
      description,
      price,
      rating,
    ]);
    const newHotel = result[0];

    res.status(201).json(newHotel);
  } catch (err) {
    console.error("Error creating hotel:", err);
    res.status(500).json({ error: "Failed to create hotel" });
  }
});

app.delete("/api/hotels/:hotelName", authenticateAdmin, async (req, res) => {
  const hotelName = decodeURIComponent(req.params.hotelName);

  if (!hotelName) {
    return res.status(400).json({ error: "Hotel name is required." });
  }

  try {
    const query = "DELETE FROM hotels WHERE name = $1 RETURNING id";
    const result = await sql(query, [hotelName]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Hotel not found." });
    }

    res.status(200).json({ message: "Hotel deleted successfully." });
  } catch (err) {
    console.error("Error deleting hotel:", err);
    res.status(500).json({ error: "Failed to delete hotel." });
  }
});

// app.get("/api/rooms", authenticateAdmin, async (req, res) => {
//   try {
//     const query = "SELECT * FROM rooms"; // Query to fetch all rooms
//     const rooms = await sql(query); // Get rooms from the database
//     res.status(200).json(rooms); // Send rooms data to frontend
//   } catch (err) {
//     console.error("Error fetching rooms:", err);
//     res.status(500).json({ error: "Failed to fetch rooms" });
//   }
// });

// // Update room details
// app.put("/api/rooms/:roomId", authenticateAdmin, async (req, res) => {
//     const { roomId } = req.params;
//     const { room_type, price, capacity, available } = req.body;

//     // Update room data in the database
//     const query = `
//         UPDATE rooms
//         SET room_type = $1, price = $2, capacity = $3, available = $4
//         WHERE id = $5
//         RETURNING *;
//     `;
//     try {
//         const result = await sql(query, [room_type, price, capacity, available, roomId]);
//         res.status(200).json(result[0]);
//     } catch (err) {
//         console.error("Error updating room:", err);
//         res.status(500).json({ error: "Failed to update room" });
//     }
// });

// Fetch all feedbacks for admin to manage
app.get("/api/feedbacks", authenticateAdmin, async (req, res) => {
  try {
    const query = "SELECT * FROM feedbacks";
    const result = await sql(query);
    res.json(result);
  } catch (err) {
    console.error("Error fetching feedbacks:", err);
    res.status(500).json({ error: "Failed to fetch feedbacks" });
  }
});

// Edit feedback
app.put("/api/feedbacks/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  try {
    const query = `
      UPDATE feedbacks
      SET rating = $1, comment = $2
      WHERE id = $3
      RETURNING *;
    `;
    const result = await sql(query, [rating, comment, id]);

    if (result.length > 0) {
      res.json(result[0]);
    } else {
      res.status(404).json({ message: "Feedback not found" });
    }
  } catch (err) {
    console.error("Error editing feedback:", err);
    res.status(500).json({ error: "Failed to edit feedback" });
  }
});

app.delete("/api/feedbacks/:id", authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM feedbacks WHERE id = $1 RETURNING *;";
    const result = await sql(query, [id]);

    if (result.length > 0) {
      res.json({ message: "Feedback deleted successfully" });
    } else {
      res.status(404).json({ message: "Feedback not found" });
    }
  } catch (err) {
    console.error("Error deleting feedback:", err);
    res.status(500).json({ error: "Failed to delete feedback" });
  }
});

// Fetch rooms for a specific hotel
app.get("/api/rooms/:hotelId", authenticateAdmin, async (req, res) => {
  const { hotelId } = req.params;
  if (isNaN(hotelId)) {
    return res.status(400).json({ error: "Invalid hotel ID" });
  }

  try {
    const query = "SELECT * FROM rooms WHERE hotel_id = $1";
    const result = await sql(query, [hotelId]);
    res.json(result);
  } catch (err) {
    console.error("Error fetching rooms:", err);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// Add a new room to a hotel
app.post("/api/rooms/:hotelId", authenticateAdmin, async (req, res) => {
  const { hotelId } = req.params;
  const { roomType, price, capacity, available } = req.body;

  try {
    const query = `
      INSERT INTO rooms (hotel_id, room_type, price, capacity, available)
      VALUES ($1, $2, $3, $4, $5) RETURNING *;
    `;
    const result = await sql(query, [
      hotelId,
      roomType,
      price,
      capacity,
      available,
    ]);
    res.status(201).json(result[0]);
  } catch (err) {
    console.error("Error adding room:", err);
    res.status(500).json({ error: "Failed to add room" });
  }
});

// Edit room details
app.put("/api/rooms/:roomId", authenticateAdmin, async (req, res) => {
  const { roomId } = req.params;
  const { roomType, price, capacity, available } = req.body;

  try {
    const query = `
      UPDATE rooms
      SET room_type = $1, price = $2, capacity = $3, available = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *;
    `;
    const result = await sql(query, [
      roomType,
      price,
      capacity,
      available,
      roomId,
    ]);

    if (result.length > 0) {
      res.json(result[0]);
    } else {
      res.status(404).json({ message: "Room not found" });
    }
  } catch (err) {
    console.error("Error editing room:", err);
    res.status(500).json({ error: "Failed to edit room" });
  }
});

// Delete a room
app.delete("/api/rooms/:roomId", authenticateAdmin, async (req, res) => {
  const { roomId } = req.params;

  try {
    const query = "DELETE FROM rooms WHERE id = $1 RETURNING *;";
    const result = await sql(query, [roomId]);

    if (result.length > 0) {
      res.json({ message: "Room deleted successfully" });
    } else {
      res.status(404).json({ message: "Room not found" });
    }
  } catch (err) {
    console.error("Error deleting room:", err);
    res.status(500).json({ error: "Failed to delete room" });
  }
});

app.put("/api/users/update", async (req, res) => {
  const { userId, newEmail, newPassword } = req.body;

  if (!userId || (!newEmail && !newPassword)) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const client = new Client({
    connectionString:
      "postgresql://bookingdb_owner:npg_wLlqgXz2QaW8@ep-aged-snowflake-a53w18dx-pooler.us-east-2.aws.neon.tech/bookingdb?sslmode=require",
  });
  await client.connect();

  try {
    const currentUserQuery = "SELECT email FROM users WHERE id = $1";
    const currentUserResult = await client.query(currentUserQuery, [userId]);

    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentEmail = currentUserResult.rows[0].email;

    // If the email is not being changed, skip email validation
    if (newEmail && newEmail !== currentEmail) {
      const checkEmailQuery = "SELECT id FROM users WHERE email = $1";
      const emailExists = await client.query(checkEmailQuery, [newEmail]);

      if (emailExists.rows.length > 0) {
        return res.status(400).json({ error: "Email is already taken!" });
      }

      // Update email if it's changed
      const updateEmailQuery = "UPDATE users SET email = $1 WHERE id = $2";
      await client.query(updateEmailQuery, [newEmail, userId]);
    }

    // If a new password is provided, update it
    if (newPassword) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      const updatePasswordQuery =
        "UPDATE users SET password_hash = $1 WHERE id = $2";
      await client.query(updatePasswordQuery, [hashedPassword, userId]);
    }

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update profile" });
  } finally {
    client.end();
  }
});

app.get("/api/reservations", async (req, res) => {
  try {
    const query = `
      SELECT r.id, r.first_name, r.last_name, r.email, r.phone, 
             r.check_in_date, r.check_out_date, r.status, 
             r.number_of_adults, r.number_of_children, r.special_requests
      FROM reservations r
    `;

    const result = await sql(query);
    res.json(result);
  } catch (err) {
    console.error("Error fetching reservations: ", err);
    res.status(500).json({ error: "Failed to fetch reservations" });
  }
});

app.put("/api/reservations/status", async (req, res) => {
  const { reservationId, newStatus } = req.body;

  if (!reservationId || !newStatus) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const validStatuses = ["Pending", "Approved", "Cancelled", "Completed"];
  if (!validStatuses.includes(newStatus)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    const updateQuery = `UPDATE reservations SET status = $1 WHERE id = $2 RETURNING *`;
    const result = await sql(updateQuery, [newStatus, reservationId]);

    if (result.length === 0) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    res.status(200).json({
      message: "Reservation status updated successfully",
      reservation: result[0],
    });
  } catch (error) {
    console.error("Error updating reservation status:", error);
    res.status(500).json({ error: "Failed to update reservation status" });
  }
});

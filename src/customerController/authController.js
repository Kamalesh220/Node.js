
const bcrypt = require("bcrypt");
const { sql, poolPromise } = require("../config/db_connection");
const findDuplicate = require("../customerController/customerController").findDuplicate;

const isValidGmail = (email) =>
    /^[a-z0-9._%+-]+@gmail\.com$/i.test(email);

const validateUser = (user) => {
    if (
        typeof user.name !== "string" ||
        typeof user.email !== "string" ||
        typeof user.password !== "string" ||
        typeof user.username !== "string" ||
        !user.name.trim() ||
        !user.email.trim() ||
        !user.password.trim() ||
        !user.username.trim()
    ) {
        return "All fields are required";
    }

    if (!isValidGmail(user.email.trim())) {
        return "Email must be a valid Gmail address";
    }

    const password = user.password;

    if (password.length < 12) {
        return "Password must be at least 12 characters";
    }

    if (
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[@#&*]/.test(password)
    ) {
        return "Password must contain uppercase (A-Z), lowercase (a-z), a number (0-9), and a special character (@, #, &, *)";
    }

    return null;
};


const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
 
  // reject dates like 2026-02-31 that JavaScript silently shifts
  if (date.toISOString().slice(0, 10) !== value) return false;
 
  // must not be in the future
  return date < new Date();
};
 
const validateCustomer = (body) => {
  const { name, phone, email, dateOfBirth, address, alternatePhone } = body;
 
  const required = {
    name,
    phone,
    email,
    dateOfBirth,
    address
    };

    for (const [field, value] of Object.entries(required)) {
        if (typeof value !== "string" || !value.trim()) {
            return `${field} cannot be empty`;
        }
    }
 
  if (!isValidGmail(String(email).trim())) {
    return "Email must be a valid @gmail.com address";
  }
 
  if (!isValidDate(String(dateOfBirth).trim())) {
    return "Date of birth must be a valid past date in YYYY-MM-DD format";
  }
 
  if (!/^\d{10}$/.test(String(phone).trim())) {
    return "Phone must be 10 digits";
  }

  if (String(address).trim().length > 300) {
    return "Address must be 300 characters or less";
  }

  if (alternatePhone && String(alternatePhone).trim()) {
    if (!/^\d{10}$/.test(String(alternatePhone).trim())) {
      return "Alternate phone must be 10 digits";
    }
    if (String(alternatePhone).trim() === String(phone).trim()) {
      return "Alternate phone cannot be the same as phone";
    }
  }
 
  return null;
};


const register = async (req, res) => {
    let transaction;

    try {
        const {
            FullName,
            Email,
            Password,
            UserName,
            Phone,
            DateOfBirth,
            AlternatePhone,
            Address
        } = req.body;

        // Validate registration details
        const error = validateUser({
            name: FullName,
            email: Email,
            password: Password,
            username: UserName
        });

        if (error) {
            return res.status(400).json({
                success: false,
                message: error
            });
        }

        // Validate customer details using your existing validator
        const customerError = validateCustomer({
            name: FullName,
            phone: Phone,
            email: Email,
            dateOfBirth: DateOfBirth,
            alternatePhone: AlternatePhone,
            address: Address
        });

        if (customerError) {
            return res.status(400).json({
                success: false,
                message: customerError
            });
        }

        const email = Email.trim().toLowerCase();
        const username = UserName.trim();
        const createdBy = username;

        const pool = await poolPromise;

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        // Check existing user
        const existingUser = await new sql.Request(transaction)
            .input("Email", sql.VarChar, email)
            .input("UserName", sql.VarChar, username)
            .query(`
                SELECT UserId
                FROM Users
                WHERE Email = @Email OR UserName = @UserName
            `);

        if (existingUser.recordset.length > 0) {
            await transaction.rollback();
            transaction = null;

            return res.status(409).json({
                success: false,
                message: "User with this email or username already exists"
            });
        }

        // 1. Create user
        const hashPassword = await bcrypt.hash(Password, 10);

        const userResult = await new sql.Request(transaction)
            .input("FullName", sql.VarChar(100), FullName.trim())
            .input("Email", sql.VarChar(100), email)
            .input("Password", sql.VarChar, hashPassword)
            .input("UserName", sql.VarChar(100), username)
            .input("CreatedBy", sql.VarChar(100), createdBy)
            .query(`
                INSERT INTO Users
                    (FullName, Email, PasswordHash, UserName, CreatedBy)
                OUTPUT INSERTED.UserId
                VALUES
                    (@FullName, @Email, @Password, @UserName, @CreatedBy)
            `);

        const userId = userResult.recordset[0].UserId;

        // 2. Create customer and address using the same transaction
        const customer = await createCustomerInTransaction(
            transaction,
            {
                Name: FullName,
                Phone,
                Email: email,
                DateOfBirth,
                AlternatePhone,
                Address
            },
            createdBy
        );

        // 3. Assign customer role
        const roleResult = await new sql.Request(transaction)
            .input("UserId", sql.Int, userId)
            .input("CreatedBy", sql.VarChar(100), createdBy)
            .query(`
                INSERT INTO UserRoles
                    (UserId, RoleId, CreatedDate, CreatedBy)
                OUTPUT INSERTED.UserId
                SELECT
                    @UserId, RoleId, SYSDATETIME(), @CreatedBy
                FROM Roles
                WHERE RoleName = 'customer'
            `);

        if (roleResult.recordset.length === 0) {
            throw new Error("Customer role not found");
        }

        await transaction.commit();
        transaction = null;

        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: {
                userId,
                customer
            }
        });

    } catch (err) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Rollback error:", rollbackError.message);
            }
        }

        console.error("Registration error:", err.message);

        return res.status(err.statusCode || 500).json({
            success: false,
            message: err.statusCode
                ? err.message
                : "An error occurred while registering the user"
        });
    }
};


//Create Customer Using register new user api
const createCustomerInTransaction = async (
    transaction,
    details,
    createdBy
) => {
    const {
        Name,
        Phone,
        Email,
        DateOfBirth,
        AlternatePhone,
        Address
    } = details;

    const email = Email.trim().toLowerCase();
    const phone = Phone.trim();
    const alternatePhone = AlternatePhone?.trim() || null;

    // Check for duplicate customer details
    const duplicate = await findDuplicate(transaction, {
        email,
        phone
    });

    if (duplicate) {
        const error = new Error(duplicate);
        error.statusCode = 409;
        throw error;
    }

    // Create customer
    const customerResult = await new sql.Request(transaction)
        .input("Name", sql.VarChar(100), Name.trim())
        .input("Phone", sql.VarChar(15), phone)
        .input("Email", sql.VarChar(100), email)
        .input("DateOfBirth", sql.Date, DateOfBirth)
        .input("AlternatePhone", sql.VarChar(15), alternatePhone)
        .input("CreatedBy", sql.VarChar(100), createdBy)
        .query(`
            INSERT INTO Customer
                (Name, Phone, Email, DateOfBirth, AlternatePhone,
                 CreatedDate, CreatedBy)
            OUTPUT INSERTED.*
            VALUES
                (@Name, @Phone, @Email, @DateOfBirth, @AlternatePhone,
                 SYSDATETIME(), @CreatedBy)
        `);

    const customer = customerResult.recordset[0];

    // Create address
    const addressResult = await new sql.Request(transaction)
        .input("CustomerId", sql.Int, customer.CustomerId)
        .input("Address", sql.VarChar(300), Address.trim())
        .input("CreatedBy", sql.VarChar(100), createdBy)
        .query(`
            INSERT INTO Address
                (CustomerId, AddressText, CreatedDate, CreatedBy)
            OUTPUT INSERTED.*
            VALUES
                (@CustomerId, @Address, SYSDATETIME(), @CreatedBy)
        `);

    return {
        ...customer,
        address: addressResult.recordset[0]
    };
};


const updatePassword = async (req, res) => {
    try {
        // Get the user ID from verified authentication middleware
        const { userId, OldPassword, NewPassword } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please log in first"
            });
        }

        if (
            typeof OldPassword !== "string" ||
            typeof NewPassword !== "string" ||
            !OldPassword ||
            !NewPassword
        ) {
            return res.status(400).json({
                success: false,
                message: "Old password and new password are required"
            });
        }

        if (NewPassword.length < 12) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 12 characters"
            });
        }

        if (
            !/[A-Z]/.test(NewPassword) ||
            !/[a-z]/.test(NewPassword) ||
            !/[0-9]/.test(NewPassword) ||
            !/[@#&*]/.test(NewPassword)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "New password must contain uppercase, lowercase, number, and one of @, #, &, *"
            });
        }

        const pool = await poolPromise;

        // Get the existing password hash
        const result = await pool.request()
            .input("UserId", sql.Int, userId)
            .query(`
                SELECT PasswordHash
                FROM Users
                WHERE UserId = @UserId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const currentHash = result.recordset[0].PasswordHash;

        // Verify the old password
        const isPasswordValid = await bcrypt.compare(
            OldPassword,
            currentHash
        );

        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "Old password is incorrect"
            });
        }

        if (OldPassword === NewPassword) {
            return res.status(400).json({
                success: false,
                message: "New password must be different from old password"
            });
        }

        // Hash the new password before storing it
        const newHash = await bcrypt.hash(NewPassword, 10);

        await pool.request()
            .input("UserId", sql.Int, userId)
            .input("PasswordHash", sql.VarChar(255), newHash)
            .query(`
                UPDATE Users
                SET PasswordHash = @PasswordHash
                WHERE UserId = @UserId
            `);

        return res.status(200).json({
            success: true,
            message: "Password changed successfully"
        });

    } catch (err) {
        console.error("Change password error:", err.message);

        return res.status(500).json({
            success: false,
            message: "Unable to change password"
        });
    }
};


module.exports = {
    register,
    updatePassword
};

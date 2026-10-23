const { sql, poolPromise } = require("../config/db_connection");

const isValidGmail = (email) => /^[a-z0-9._%+-]+@gmail\.com$/i.test(email);
 
const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
 
  // reject dates like 2026-02-31 that JavaScript silently shifts
  if (date.toISOString().slice(0, 10) !== value) return false;
 
  // must not be in the future
  return date <= new Date();
};
 
const validateCustomer = (body) => {
  const { name, phone, email, dateOfBirth, address, alternatePhone } = body;
 
  const required = { name, phone, email, dateOfBirth };
  for (const [field, value] of Object.entries(required)) {
    if (!value || !String(value).trim()) {
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

const findDuplicate = async (transaction, { email, phone, excludeId = 0 }) => {
  const result = await new sql.Request(transaction)
    .input("email", sql.VarChar(100), email)
    .input("phone", sql.VarChar(15), phone)
    .input("excludeId", sql.Int, excludeId)
    .query(`
      SELECT Email, Phone
      FROM Customer
      WHERE CustomerId <> @excludeId
        AND (Email = @email OR Phone = @phone)
    `);
 
  const rows = result.recordset;
  if (rows.some((r) => r.Email.toLowerCase() === email)) return "Email already exists";
  if (rows.some((r) => r.Phone === phone)) return "Phone number already exists";
  return null;
};

//get all customers
getAllcustomer = async (req, res) => {

    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT c.*, a.AddressId, a.AddressText
            FROM Customer c
            INNER JOIN Address a ON a.CustomerId = c.CustomerId
            ORDER BY c.CustomerId
        `);
        res.status(200).json({
            success: true,
            message: "All customers fetched successfully",
            data: result.recordsets
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "An error occurred while fetching customers"
        });
    }
}

//get customer by id
getCustomerByID = async (req, res) => {

    try {
        const pool = await poolPromise;
        const result = await pool
                        .request()
                        .input('customerID', sql.Int, Number(req.params.id))
                        .query('SELECT * FROM Customer WHERE CustomerId = @customerID');

        if(!result.recordset.length) {
            res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        } else {
            res.status(200).json({
                success: true,
                message: "Customer fetched successfully",
                data: result.recordset
            });
        }
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "An error occurred while fetching the customer"
        });
    }
}

//create customer
const createCustomer = async (req, res) => {
  let transaction;

  try {
    const { Name, Phone, Email, DateOfBirth, AlternatePhone, Address } = req.body;

    const error = validateCustomer({
      name: Name,
      phone: Phone,
      email: Email,
      dateOfBirth: DateOfBirth,
      address: Address,
      alternatePhone: AlternatePhone
    });
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const createdBy = req.user.userName;
    const email = Email.trim().toLowerCase();
    const phone = Phone.trim();
    const alternatePhone = AlternatePhone ? AlternatePhone.trim() : null;

    const pool = await poolPromise;
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // duplicate check must run AFTER begin()
    const duplicate = await findDuplicate(transaction, { email, phone });
    if (duplicate) {
      await transaction.rollback();
      return res.status(409).json({ success: false, message: duplicate });
    }

    const customerResult = await new sql.Request(transaction)
      .input("Name", sql.VarChar(100), Name.trim())
      .input("Phone", sql.VarChar(15), phone)
      .input("Email", sql.VarChar(100), email)
      .input("DateOfBirth", sql.Date, DateOfBirth.trim())
      .input("AlternatePhone", sql.VarChar(15), alternatePhone)
      .input("CreatedBy", sql.VarChar(100), createdBy)
      .query(`
        INSERT INTO Customer
          (Name, Phone, Email, DateOfBirth, AlternatePhone, CreatedDate, CreatedBy)
        OUTPUT INSERTED.*
        VALUES
          (@Name, @Phone, @Email, @DateOfBirth, @AlternatePhone, SYSDATETIME(), @CreatedBy)
      `);

    const customer = customerResult.recordset[0];

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

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: { ...customer, address: addressResult.recordset[0] }
    });
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (e) { }
    }

    console.log("Create error:", err.message);
    res.status(500).json({
      success: false,
      message: "An error occurred while creating the customer"
    });
  }
};

//update customer by id
updateCustomer = async (req, res) => {

    try{
        const customerID = Number(req.params.id);
        const { Name, DateOfBirth, AlternatePhone } = req.body;
        const pool = await poolPromise

        if (!Name || !String(Name).trim()) {
            return res.status(400).json({ success: false, message: "Name cannot be empty" });
        }

        if (!DateOfBirth || !isValidDate(String(DateOfBirth).trim())) {
        return res.status(400).json({
            success: false,
            message: "Date of birth must be a valid past date in YYYY-MM-DD format"
        });
        }

        const alternatePhone = AlternatePhone ? String(AlternatePhone).trim() : null;
        if (alternatePhone && !/^\d{10}$/.test(alternatePhone)) {
        return res.status(400).json({
            success: false,
            message: "Alternate phone must be 10 digits"
        });
        }

        const findCustomer = await pool
            .request()
            .input("customerID", sql.Int, customerID)
            .query("SELECT Phone FROM Customer WHERE CustomerId = @customerID");
        
        if(findCustomer.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        if (alternatePhone && alternatePhone === findCustomer.recordset[0].Phone) {
            return res.status(400).json({
                success: false,
                message: "Alternate phone & Phon number cannot be same number"
            });
        }

        const ModifiedBy = req.user.userName;
        
        const customerResult = await pool
            .request()
            .input("customerID", sql.Int, customerID)
            .input("Name", sql.VarChar(100), Name.trim())
            .input("DateOfBirth", sql.Date, DateOfBirth.trim())
            .input("AlternatePhone", sql.VarChar(15), alternatePhone)
            .input("ModifiedBy", sql.VarChar(100), ModifiedBy)
            .query(`
                UPDATE Customer
                SET NAME = @Name, DateOfBirth = @DateOfBirth, AlternatePhone = @AlternatePhone, ModifiedBy = @ModifiedBy, ModifiedDate = SYSDATETIME()
                OUTPUT INSERTED.*
                WHERE CustomerId = @customerID
        `);

        const customer = customerResult.recordset[0];

        res.status(200).json({
            success: true,
            message: "Customer updated successfully",
            data: customer
        });
  } catch (err) {
        console.log("Update error:", err.message);

        res.status(500).json({
            success: false,
            message: "An error occurred while creating the customer"
        });
  }
}

//delete customer by id
deleteCustomer = async (req, res) => {
    let transaction;
    const customerId = Number(req.params.id);

    try {
        const pool = await poolPromise;
        transaction = await new sql.Transaction(pool);
        
    const exists = await pool
      .request()
      .input("customerId", sql.Int, customerId)
      .query("SELECT 1 AS found FROM Customer WHERE CustomerId = @customerId");

    if (exists.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = () =>
      new sql.Request(transaction).input("customerId", sql.Int, customerId);

    const orderCheck = await request().query(
      "SELECT COUNT(*) AS total FROM Orders WHERE CustomerId = @customerId"
    );

    if (orderCheck.recordset[0].total > 0) {
      await request().query(`
        DELETE FROM OrderTracking
        WHERE OrderId IN (SELECT OrderId FROM Orders WHERE CustomerId = @customerId)
      `);

      await request().query(`
        DELETE FROM OrderItems
        WHERE OrderId IN (SELECT OrderId FROM Orders WHERE CustomerId = @customerId)
      `);

      await request().query("DELETE FROM Orders WHERE CustomerId = @customerId");
    }

    await request().query("DELETE FROM Address WHERE CustomerId = @customerId");
    await request().query("DELETE FROM Customer WHERE CustomerId = @customerId");

    await transaction.commit();

        res.status(200).json({
            success: true,
            message: "Customer deleted successfully"
        });
    } catch (err) {
        console.log("Delete error:", err.message);

        if (transaction) {
            try { await transaction.rollback(); } catch (e) { }
        }

        res.status(500).json({
            success: false,
            message: "An error occurred while deleting the customer"
        });
    }
}

module.exports = {
    getAllcustomer,
    getCustomerByID,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    findDuplicate,
};
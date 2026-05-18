export interface ParsedQuery {
  collection: string;
  action: "find" | "count" | "aggregate";
  filter: Record<string, any>;
  explanation: string;
  codeSnippet: string;
  aggregation?: {
    field: string;
    type: "sum" | "avg" | "count";
    groupBy?: string;
  };
}

/**
 * An offline, client-side NLP parser that translates natural language questions
 * into structured database queries for ZerithDB collections.
 */
export function parseNaturalLanguageQuery(input: string): ParsedQuery {
  const query = input.trim().toLowerCase();
  
  // 1. Identify Target Collection
  let collection = "todos"; // Default collection
  if (query.includes("product") || query.includes("item") || query.includes("price")) {
    collection = "products";
  } else if (query.includes("user") || query.includes("customer") || query.includes("member") || query.includes("admin")) {
    collection = "users";
  } else if (query.includes("order") || query.includes("sale") || query.includes("transaction")) {
    collection = "orders";
  } else if (query.includes("log") || query.includes("event") || query.includes("history")) {
    collection = "logs";
  } else if (query.includes("todo") || query.includes("task") || query.includes("completed")) {
    collection = "todos";
  }

  // 2. Identify Action / Intent
  let action: "find" | "count" | "aggregate" = "find";
  let aggType: "sum" | "avg" | "count" | undefined;
  let aggField = "";

  if (query.startsWith("count") || query.includes("how many") || query.includes("total number of")) {
    action = "count";
  } else if (query.includes("total") || query.includes("sum of") || query.includes("revenue")) {
    action = "aggregate";
    aggType = "sum";
    aggField = query.includes("revenue") || query.includes("price") ? "price" : "amount";
  } else if (query.includes("average") || query.includes("avg")) {
    action = "aggregate";
    aggType = "avg";
    aggField = query.includes("price") ? "price" : "amount";
  }

  // 3. Extract Filters
  const filter: Record<string, any> = {};
  const filterDescriptions: string[] = [];

  // Collection-specific filter parsing
  if (collection === "todos") {
    if (query.includes("completed") || query.includes("done") || query.includes("finished")) {
      filter.completed = true;
      filterDescriptions.push("completed is true");
    } else if (query.includes("pending") || query.includes("incomplete") || query.includes("active")) {
      filter.completed = false;
      filterDescriptions.push("completed is false");
    }
  }

  if (collection === "users") {
    // Role filter
    if (query.includes("admin")) {
      filter.role = "admin";
      filterDescriptions.push("role is 'admin'");
    } else if (query.includes("moderator")) {
      filter.role = "moderator";
      filterDescriptions.push("role is 'moderator'");
    } else if (query.includes("customer") || query.includes("user")) {
      // Don't add default customer role unless explicitly stated
      if (query.includes("customer")) {
        filter.role = "customer";
        filterDescriptions.push("role is 'customer'");
      }
    }

    // Active status filter
    if (query.includes("active") && !query.includes("inactive")) {
      filter.active = true;
      filterDescriptions.push("status is active");
    } else if (query.includes("inactive") || query.includes("disabled") || query.includes("blocked")) {
      filter.active = false;
      filterDescriptions.push("status is inactive");
    }
  }

  if (collection === "products") {
    // Numeric filters (price/stock)
    const numberMatch = query.match(/\$?(\d+)/);
    const value = numberMatch ? parseFloat(numberMatch[1]) : null;

    if (value !== null) {
      if (query.includes("under") || query.includes("less than") || query.includes("cheaper than") || query.includes("<")) {
        filter.price = { $lt: value };
        filterDescriptions.push(`price is less than $${value}`);
      } else if (query.includes("over") || query.includes("greater than") || query.includes("more than") || query.includes(">")) {
        filter.price = { $gt: value };
        filterDescriptions.push(`price is greater than $${value}`);
      } else {
        filter.price = value;
        filterDescriptions.push(`price is exactly $${value}`);
      }
    }

    // Category filter
    if (query.includes("electronics") || query.includes("tech") || query.includes("gadget")) {
      filter.category = "Electronics";
      filterDescriptions.push("category is 'Electronics'");
    } else if (query.includes("clothing") || query.includes("shirt") || query.includes("apparel") || query.includes("wear")) {
      filter.category = "Clothing";
      filterDescriptions.push("category is 'Clothing'");
    } else if (query.includes("home") || query.includes("furniture") || query.includes("kitchen")) {
      filter.category = "Home & Kitchen";
      filterDescriptions.push("category is 'Home & Kitchen'");
    } else if (query.includes("book") || query.includes("read")) {
      filter.category = "Books";
      filterDescriptions.push("category is 'Books'");
    }
  }

  if (collection === "orders") {
    // Status filters
    if (query.includes("delivered") || query.includes("shipped")) {
      filter.status = "delivered";
      filterDescriptions.push("status is 'delivered'");
    } else if (query.includes("pending") || query.includes("processing")) {
      filter.status = "pending";
      filterDescriptions.push("status is 'pending'");
    } else if (query.includes("cancelled") || query.includes("returned")) {
      filter.status = "cancelled";
      filterDescriptions.push("status is 'cancelled'");
    }

    // Customer name filter
    const customerMatch = query.match(/(?:by|for)\s+([a-zA-Z]+)/);
    if (customerMatch && !["active", "admin", "moderator", "customer", "delivered", "pending", "cancelled"].includes(customerMatch[1].toLowerCase())) {
      const name = customerMatch[1];
      // Capitalize first letter
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
      filter.customerName = capitalized;
      filterDescriptions.push(`customer name is '${capitalized}'`);
    }
  }

  if (collection === "logs") {
    // Level filters
    if (query.includes("error") || query.includes("fail") || query.includes("crash")) {
      filter.level = "error";
      filterDescriptions.push("log level is 'error'");
    } else if (query.includes("warn") || query.includes("warning")) {
      filter.level = "warn";
      filterDescriptions.push("log level is 'warn'");
    } else if (query.includes("info") || query.includes("debug")) {
      filter.level = "info";
      filterDescriptions.push("log level is 'info'");
    }
  }

  // General string searching in description or name
  const quotesMatch = query.match(/"([^"]+)"|'([^']+)'/);
  if (quotesMatch) {
    const searchTerm = quotesMatch[1] || quotesMatch[2];
    const key = collection === "todos" || collection === "logs" ? "text" : "name";
    filter[key] = { $regex: searchTerm, $options: "i" };
    filterDescriptions.push(`containing term "${searchTerm}"`);
  }

  // 4. Build Explanation and Code Snippets
  let explanation = "";
  let codeSnippet = "";
  const filterStr = Object.keys(filter).length > 0 ? JSON.stringify(filter, null, 2) : "{}";

  if (action === "count") {
    explanation = `Counted documents in the **${collection}** collection`;
    if (filterDescriptions.length > 0) {
      explanation += ` where **${filterDescriptions.join(" and ")}**`;
    }
    explanation += `.`;
    codeSnippet = `const count = await app.db("${collection}").count(${filterStr});`;
  } else if (action === "aggregate" && aggType) {
    explanation = `Calculated the **${aggType}** of \`${aggField}\` in the **${collection}** collection`;
    if (filterDescriptions.length > 0) {
      explanation += ` where **${filterDescriptions.join(" and ")}**`;
    }
    explanation += `.`;
    codeSnippet = `// In ZerithDB, perform aggregation client-side or using DB aggregation:
const documents = await app.db("${collection}").find(${filterStr});
const total = documents.reduce((sum, doc) => sum + (doc.${aggField} || 0), 0);
${aggType === "avg" ? "const average = documents.length ? total / documents.length : 0;" : ""}`;
  } else {
    explanation = `Retrieved matching documents from the **${collection}** collection`;
    if (filterDescriptions.length > 0) {
      explanation += ` where **${filterDescriptions.join(" and ")}**`;
    }
    explanation += `.`;
    codeSnippet = `const results = await app.db("${collection}").find(${filterStr});`;
  }

  return {
    collection,
    action,
    filter,
    explanation,
    codeSnippet,
    ...(action === "aggregate" && aggType ? { aggregation: { field: aggField, type: aggType } } : {})
  };
}

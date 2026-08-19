import * as client from "@prisma/client";
console.log("Keys of @prisma/client:", Object.keys(client));
console.log("Default export keys:", Object.keys(client.default || {}));

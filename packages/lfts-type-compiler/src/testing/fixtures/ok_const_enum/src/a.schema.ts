// Test const enum support (v0.8.0)

// Numeric const enum (auto-increment)
const enum Status {
  Pending,
  Active,
  Completed,
}

// Numeric const enum (explicit values)
const enum Priority {
  Low = 1,
  Medium = 5,
  High = 10,
}

// String const enum
const enum Color {
  Red = "red",
  Green = "green",
  Blue = "blue",
}

// Use const enums in schemas (should expand to literal unions)
type Task = {
  readonly status: Status;
  readonly priority: Priority;
  readonly color: Color;
};

export type TaskSchema = Task;

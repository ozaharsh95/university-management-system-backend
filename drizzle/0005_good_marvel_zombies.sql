DROP INDEX "enrollments_student_class_unique";--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_class_unique" UNIQUE("student_id","class_id");
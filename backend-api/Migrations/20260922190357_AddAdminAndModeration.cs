using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BackendApi.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminAndModeration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "LastLoginAt",
                table: "Users",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                table: "UniversityCourses",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                table: "Universities",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            // Lessons.CreatedAt becomes Unix epoch millis (see AppDbContext's
            // UtcEpochMillis converter) so the admin stats can filter on it —
            // SQLite cannot translate WHERE/ORDER BY over a DateTimeOffset
            // TEXT column.
            //
            // This UPDATE must run BEFORE the AlterColumn below. AlterColumn
            // on SQLite rebuilds the table and copies values across verbatim;
            // an ISO-8601 string is not a well-formed integer literal, so it
            // would survive the copy as TEXT in a column EF then reads as a
            // long, and every lesson query would start throwing. Rewriting
            // the values first means the rebuild copies genuine numbers.
            //
            // julianday() parses the stored format ("2026-09-22 18:53:04.9+00:00")
            // and keeps sub-second precision; 2440587.5 is the Julian day of
            // the Unix epoch. The typeof() guard makes this safe to re-run.
            migrationBuilder.Sql(
                "UPDATE Lessons SET CreatedAt = CAST(ROUND((julianday(CreatedAt) - 2440587.5) * 86400000.0) AS INTEGER) " +
                "WHERE typeof(CreatedAt) = 'text';");

            migrationBuilder.AlterColumn<long>(
                name: "CreatedAt",
                table: "Lessons",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(DateTimeOffset),
                oldType: "TEXT");

            migrationBuilder.AddColumn<string>(
                name: "ModerationLockReason",
                table: "Lessons",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ModerationLockedAt",
                table: "Lessons",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewReason",
                table: "CourseProposals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReviewedByAdminId",
                table: "CourseProposals",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AdminAuditEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    AdminId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Action = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    TargetType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    TargetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniversityId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Reason = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminAuditEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Admins",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 320, nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: true),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    UniversityId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false),
                    DisabledAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Admins", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Admins_Universities_UniversityId",
                        column: x => x.UniversityId,
                        principalTable: "Universities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ShareBans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    IssuedByAdminId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Reason = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    Hours = table.Column<int>(type: "INTEGER", nullable: false),
                    StartsAt = table.Column<long>(type: "INTEGER", nullable: false),
                    ExpiresAt = table.Column<long>(type: "INTEGER", nullable: false),
                    LiftedAt = table.Column<long>(type: "INTEGER", nullable: true),
                    LiftedByAdminId = table.Column<Guid>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShareBans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ShareEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    LessonId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniversityId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShareEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdminAuditEntries_TargetType_TargetId",
                table: "AdminAuditEntries",
                columns: new[] { "TargetType", "TargetId" });

            migrationBuilder.CreateIndex(
                name: "IX_AdminAuditEntries_UniversityId",
                table: "AdminAuditEntries",
                column: "UniversityId");

            migrationBuilder.CreateIndex(
                name: "IX_Admins_Email",
                table: "Admins",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Admins_UniversityId",
                table: "Admins",
                column: "UniversityId");

            migrationBuilder.CreateIndex(
                name: "IX_ShareBans_UserId_ExpiresAt",
                table: "ShareBans",
                columns: new[] { "UserId", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ShareEvents_LessonId",
                table: "ShareEvents",
                column: "LessonId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdminAuditEntries");

            migrationBuilder.DropTable(
                name: "Admins");

            migrationBuilder.DropTable(
                name: "ShareBans");

            migrationBuilder.DropTable(
                name: "ShareEvents");

            migrationBuilder.DropColumn(
                name: "LastLoginAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                table: "UniversityCourses");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                table: "Universities");

            migrationBuilder.DropColumn(
                name: "ModerationLockReason",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "ModerationLockedAt",
                table: "Lessons");

            migrationBuilder.DropColumn(
                name: "ReviewReason",
                table: "CourseProposals");

            migrationBuilder.DropColumn(
                name: "ReviewedByAdminId",
                table: "CourseProposals");

            // Mirror of the Up conversion: back to ISO-8601 text before the
            // rebuild turns the column back into TEXT.
            migrationBuilder.Sql(
                "UPDATE Lessons SET CreatedAt = strftime('%Y-%m-%d %H:%M:%f', CreatedAt / 1000.0, 'unixepoch') || '+00:00' " +
                "WHERE typeof(CreatedAt) = 'integer';");

            migrationBuilder.AlterColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "Lessons",
                type: "TEXT",
                nullable: false,
                oldClrType: typeof(long),
                oldType: "INTEGER");
        }
    }
}

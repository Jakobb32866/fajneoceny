using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BackendApi.Migrations
{
    /// <inheritdoc />
    public partial class AddSrsSchedulingAndSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "SpacedRepetitionStates",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "Due",
                table: "SpacedRepetitionStates",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<int>(
                name: "Lapses",
                table: "SpacedRepetitionStates",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "LearningStepIndex",
                table: "SpacedRepetitionStates",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Phase",
                table: "SpacedRepetitionStates",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "UserSrsSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    DailySessionSize = table.Column<int>(type: "INTEGER", nullable: false),
                    NewCardsPerDay = table.Column<int>(type: "INTEGER", nullable: false),
                    LearningStepsMinutes = table.Column<string>(type: "TEXT", nullable: false),
                    RelearningStepsMinutes = table.Column<string>(type: "TEXT", nullable: false),
                    GraduatingIntervalDays = table.Column<int>(type: "INTEGER", nullable: false),
                    EasyIntervalDays = table.Column<int>(type: "INTEGER", nullable: false),
                    StartingEase = table.Column<double>(type: "REAL", nullable: false),
                    EasyBonus = table.Column<double>(type: "REAL", nullable: false),
                    HardMultiplier = table.Column<double>(type: "REAL", nullable: false),
                    LapseNewIntervalMultiplier = table.Column<double>(type: "REAL", nullable: false),
                    MinimumIntervalDays = table.Column<int>(type: "INTEGER", nullable: false),
                    MaximumIntervalDays = table.Column<int>(type: "INTEGER", nullable: false),
                    Timezone = table.Column<string>(type: "TEXT", nullable: false),
                    DayRolloverHour = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSrsSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserSrsSettings_UserId",
                table: "UserSrsSettings",
                column: "UserId",
                unique: true);

            // Backfill existing scheduling rows for the new Anki-style model:
            // cards with any successful repetition are treated as graduated
            // (Review = 2), the rest as still learning (Learning = 1). Due is
            // derived from the old day-granular NextReviewDate at the 04:00
            // rollover, and CreatedAt from the last review (or that due day).
            migrationBuilder.Sql(
                "UPDATE SpacedRepetitionStates SET " +
                "Phase = CASE WHEN Repetitions > 0 THEN 2 ELSE 1 END, " +
                "Due = NextReviewDate || 'T04:00:00+00:00', " +
                "CreatedAt = COALESCE(LastReviewedAt, NextReviewDate || 'T04:00:00+00:00');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserSrsSettings");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "SpacedRepetitionStates");

            migrationBuilder.DropColumn(
                name: "Due",
                table: "SpacedRepetitionStates");

            migrationBuilder.DropColumn(
                name: "Lapses",
                table: "SpacedRepetitionStates");

            migrationBuilder.DropColumn(
                name: "LearningStepIndex",
                table: "SpacedRepetitionStates");

            migrationBuilder.DropColumn(
                name: "Phase",
                table: "SpacedRepetitionStates");
        }
    }
}

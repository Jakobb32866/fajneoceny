using BackendApi.Domain;

namespace BackendApi.Services.Grading;

public record ComponentGradeResult(
    Guid ComponentId,
    string Name,
    GradeCategory Category,
    double WeightPercent,
    bool IsAdHoc,
    double? AverageScorePercent);

public record SubjectGradeResult(
    /// <summary>Weighted average over components that already have at least one entry, renormalized to 100%. Best read as "your grade if the semester ended today".</summary>
    double? CurrentEstimatePercent,
    /// <summary>Weighted average over ALL components, treating ungraded ones as 0. Worst-case final grade.</summary>
    double ProvisionalFinalPercent,
    double TotalWeightPercent,
    List<ComponentGradeResult> Components);

public interface IGradeCalculationService
{
    SubjectGradeResult Calculate(GradingScheme scheme);
}

public class GradeCalculationService : IGradeCalculationService
{
    public SubjectGradeResult Calculate(GradingScheme scheme)
    {
        var results = new List<ComponentGradeResult>();
        double weightedSumGraded = 0;
        double weightGraded = 0;
        double weightedSumAll = 0;
        double weightAll = 0;

        foreach (var component in scheme.Components)
        {
            double? avgPercent = component.Entries.Count == 0
                ? null
                : component.Entries.Average(e => e.MaxScore <= 0 ? 0 : e.Score / e.MaxScore * 100);

            results.Add(new ComponentGradeResult(
                component.Id,
                component.Name,
                component.Category,
                component.WeightPercent,
                component.IsAdHoc,
                avgPercent));

            weightAll += component.WeightPercent;
            weightedSumAll += (avgPercent ?? 0) * component.WeightPercent;

            if (avgPercent is not null)
            {
                weightGraded += component.WeightPercent;
                weightedSumGraded += avgPercent.Value * component.WeightPercent;
            }
        }

        double? currentEstimate = weightGraded <= 0 ? null : weightedSumGraded / weightGraded;
        double provisionalFinal = weightAll <= 0 ? 0 : weightedSumAll / weightAll;

        return new SubjectGradeResult(currentEstimate, provisionalFinal, weightAll, results);
    }
}

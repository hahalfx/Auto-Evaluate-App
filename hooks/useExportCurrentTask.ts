import { useAppSelector } from "@/store/hooks";
import { selectAllSamples } from "@/store/samplesSlice";
import { selectCurrentTask } from "@/store/taskSlice";
import generateASRTestReport, {
  ASRTestReport,
} from "@/utils/generateASRTestReport";

export function useExportCurrentTask() {
    const Task = useAppSelector(selectCurrentTask);
    const samples = useAppSelector(selectAllSamples)
  const exportCurrentTask = () => {
    
    if (Task) {
      const TaskReport: ASRTestReport = {
        taskName: Task.name,
        date: Task.created_at,
        audioType: Task.audioType || "",
        audioFile: Task.audioFile || "",
        audioDuration: Task.audioDuration || "",
        audioCategory: Task.audioCategory || "",
        testCollection: Task.testCollection || "",
        testDuration: Task.testDuration || "",
        sentenceAccuracy: Task.sentenceAccuracy || null,
        wordAccuracy: Task.wordAccuracy || null,
        characterErrorRate: Task.characterErrorRate || null,
        recognitionSuccessRate: Task.recognitionSuccessRate || null,
        totalWords: Task.totalWords || null,
        insertionErrors: Task.insertionErrors || null,
        deletionErrors: Task.deletionErrors || null,
        substitutionErrors: Task.substitutionErrors || null,
        fastestRecognitionTime: Task.fastestRecognitionTime || null,
        slowestRecognitionTime: Task.slowestRecognitionTime || null,
        averageRecognitionTime: Task.averageRecognitionTime || null,
        completedSamples: Task.completedSamples || null,
        items: Task.test_result
          ? Object.entries(Task.test_result).map(([id, item]) => {
              return {
                audioFile: item.audioFile || "",
                recognitionFile: item.recognitionFile || "",
                device: item.device || "科大讯飞ASRAPI",
                recognitionResult: item.recognitionResult || "",
                insertionErrors:
                  item.assessment?.semantic_correctness?.score !== undefined
                    ? item.assessment?.semantic_correctness?.score
                    : null,
                deletionErrors:
                  item.assessment?.state_change_confirmation?.score !==
                  undefined
                    ? item.assessment?.state_change_confirmation?.score
                    : null,
                substitutionErrors:
                  item.assessment?.unambiguous_expression?.score !== undefined
                    ? item.assessment?.unambiguous_expression?.score
                    : null,
                totalWords: item.totalWords || null,
                referenceText: samples[Number(id)].text || "",
                recognizedText: item.recognizedText || "",
                resultStatus: item.resultStatus || "",
                recognitionTime: item.recognitionTime || null,
                machineResponse: Task.machine_response
                  ? Task.machine_response[Number(id)]?.text
                  : "",
                responseTime: item.responseTime || null,
                LLMAnalysisResult: String(item.assessment.valid) || "",
                totalScore: item.assessment?.overall_score || null,
                semantic_correctness:
                  item.assessment?.semantic_correctness?.score || null,
                state_change_confirmation:
                  item.assessment?.state_change_confirmation?.score || null,
                unambiguous_expression:
                  item.assessment?.unambiguous_expression?.score || null,
                testTime: item.test_time || "",
              };
            })
          : [],
      };
      generateASRTestReport(TaskReport, `${Task.name}.xlsx`);
    }
  };
  return { exportCurrentTask };
}

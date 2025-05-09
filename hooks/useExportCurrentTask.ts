import { useAppSelector } from "@/store/hooks";
import { selectAllSamples, selectWakeWords } from "@/store/samplesSlice";
import { selectCurrentTask } from "@/store/taskSlice";
import generateASRTestReport, {
  ASRTestReport,
} from "@/utils/generateASRTestReport";

export function useExportCurrentTask() {
    const Task = useAppSelector(selectCurrentTask);
    const samples = useAppSelector(selectAllSamples);
    const wakeWords = useAppSelector(selectWakeWords);
  const exportCurrentTask = () => {
    
    if (Task) {
      // 使用类型断言避免类型错误
      const TaskReport = {
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
        completedSamples: Task.test_result ? Object.keys(Task.test_result).length : 0,
        items: Task.test_result && samples
          ? Object.entries(Task.test_result).map(([id, item]) => {
              return {
                audioFile: wakeWords[Task.wake_word_id-1]?.text || "",
                recognitionFile: item.recognitionFile || "",
                device: item.device || "科大讯飞ASRAPI",
                recognitionResult: item.recognitionResult || "成功",
                insertionErrors:
                  item.insertionErrors !== undefined
                    ? item.insertionErrors
                    : null,
                deletionErrors:
                  item.deletionErrors !==
                  undefined
                    ? item.deletionErrors
                    : null,
                substitutionErrors:
                  item.substitutionErrors !== undefined
                    ? item.substitutionErrors
                    : null,
                totalWords: item.totalWords || null,
                referenceText: samples[Number(id)-1]?.text || "",
                recognizedText: item.recognizedText || "",
                resultStatus: item.resultStatus || "",
                recognitionTime: item.recognitionTime || null,
                machineResponse: Task.machine_response
                  ? Task.machine_response[Number(id)]?.text
                  : "",
                responseTime: item.responseTime || null,
                LLMAnalysisResult: item.assessment ? String(item.assessment.valid) : "",
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
      // 使用类型断言将TaskReport转换为ASRTestReport类型
      generateASRTestReport(TaskReport as ASRTestReport, `${Task.name}.xlsx`);
    }
  };
  return { exportCurrentTask };
}

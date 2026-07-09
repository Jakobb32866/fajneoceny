import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DailyFlashcardsScreen } from '../screens/DailyFlashcardsScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { LessonScreen } from '../screens/LessonScreen';
import { QuizPlayerScreen } from '../screens/QuizPlayerScreen';
import { SubjectScreen } from '../screens/SubjectScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Dashboard">
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Moje przedmioty' }} />
      <Stack.Screen
        name="Subject"
        component={SubjectScreen}
        options={({ route }) => ({ title: route.params.subjectName })}
      />
      <Stack.Screen
        name="Lesson"
        component={LessonScreen}
        options={({ route }) => ({ title: route.params.lessonTitle })}
      />
      <Stack.Screen name="QuizPlayer" component={QuizPlayerScreen} options={{ title: 'Quiz' }} />
      <Stack.Screen
        name="DailyFlashcards"
        component={DailyFlashcardsScreen}
        options={{ title: 'Dzisiejsze fiszki' }}
      />
    </Stack.Navigator>
  );
}

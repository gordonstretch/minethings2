<?

foreach($tasks as $task)
{
	echo $html->link($task['name'], $task['url']);
	echo "<br>";
}

?>
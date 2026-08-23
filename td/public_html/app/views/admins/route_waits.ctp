<?

print "Longest Wait time in past 24 hrs: ";
print $longestWait['time'].'s for a '.$longestWait['vehicle'].' on the '.$longestWait['cities'][0].'-'.$longestWait['cities'][1].' route at location '.$longestWait['location']

?><BR><BR><?

print "Current wait times:";
?><table><?
foreach ($currentWaitTimes as $line => $time)
	echo $html->tableCells(array(array($line, $time)));
?></table><?
	

?>
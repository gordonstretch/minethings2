<span style="font-size:12px">
<table>
<?

foreach($signups as $s)
	echo $html->tableCells(array(array(
		$html->link($s['name'], '/miners/profile/'.$s['name']),
		$s['ip'],
		$s['referrer'],
		$s['recruiter'],
		$s['tutorialStage'],
		$s['converted'],
		$s['created'],
		)));

?>

</table>
</span>
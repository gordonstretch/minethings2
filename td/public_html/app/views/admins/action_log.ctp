<span style="float:right">
Spikes:
<table>
<?
foreach( $spikes as $s )
{
	$miner = $html->link($s['miner'], '/miners/profile/'.$s['miner']);
	echo $html->tableCells(array(array($miner, $s['action'], $s['duration'], $s['time'])));
}
?>

</table>
</span>

<? echo 'total time: '.$totalTime.' minutes'; ?>
<? echo '<br>busy '.$workTimePercent.' percent of the time'; ?>
<table>
<?
foreach($actionTotals as $action => $time)
	echo $html->tableCells(array(array($action, $time)));
?>
</table>

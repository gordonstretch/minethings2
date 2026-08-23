<? echo $ajax->div('TransfersDiv'); ?>
<span style="font-size:12px">
<table>
<? echo $html->tableHeaders(array('From', 'To', 'Gold', 'Approved')); 
foreach($transfers as $t)
{
	$from = $html->link($t['from'], '/miners/profile/'.$t['from']);
	$to = $html->link($t['to'], '/miners/profile/'.$t['to']);
	echo $html->tableCells(array($from, $to, $t['gold'], $t['approved']));
}
?>
</table></span>
<? echo $ajax->divEnd('TransfersDiv'); ?>
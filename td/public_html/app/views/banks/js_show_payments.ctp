<? if (count($payments)): ?>
	<table>
	<?
	foreach ($payments as $p)
		echo $html->tableCells(array(array(
			date('m-d', $p['created_time']),
			$p['gold'].'g',
			)));
	?>
	</table>
<? else: ?>
	<p>No payments made</p>
<?endif;?>
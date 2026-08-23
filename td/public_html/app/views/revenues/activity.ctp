<table>
<?

foreach($days as $day)
{
	echo $html->tableCells(array(
		$day['date'],
		$day['numberActive'],
		));
}

?>
</table>
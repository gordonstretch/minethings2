<? 
if (strlen($message)):
	echo $message;
else:?> 
	<SCRIPT type="text/javascript">window.location = "<?echo $html->url('/mines/check_mines');?>"</SCRIPT>
<?endif;?>
